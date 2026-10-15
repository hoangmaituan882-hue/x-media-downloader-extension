// ═══════════════════════════════════════════════════════════════
// X Media Downloader — 后台 Service Worker（Manifest V3）
// 职责：代表内容脚本抓取媒体字节。
// 扩展后台发起的请求不受页面 CORS 约束，twimg CDN 即使收紧
// Access-Control 策略也不影响下载；Chrome 消息只支持 JSON，
// 媒体以有序的小段 base64 传回，结束时校验总字节数。
// ═══════════════════════════════════════════════════════════════

// 点击扩展图标 → 通知当前标签页展开面板（v7.3.1：修复“点击扩展没有界面”）
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "xmd-show-panel" });
  } catch (e) {
    // 非 x.com 标签页未注入内容脚本，静默忽略
  }
});

// 打开独立画廊页（由 Background 发起 chrome.tabs.create，绕过页面沙箱对 chrome-extension:// 导航拦截）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "xmd-open-gallery") {
    const q = msg.query || "";
    const url = chrome.runtime.getURL("gallery.html" + q);
    chrome.tabs.create({ url }, tab => {
      sendResponse({ ok: !chrome.runtime.lastError, tabId: tab?.id });
    });
    return true;
  }
  return false;
});

// 内容脚本请求：chrome.downloads 保存到下载目录（filename 可含子目录）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "xmd-download-file") return false;
  chrome.downloads.download(
    { url: msg.url, filename: msg.filename, saveAs: false, conflictAction: "uniquify" },
    id => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      if (id == null) { sendResponse({ ok: false, error: "浏览器未创建下载任务" }); return; }
      // 等下载完成后回传 fileSize，供历史「总体积」统计图片体积
      let settled = false;
      const finish = response => {
        if (settled) return;
        settled = true;
        chrome.downloads.onChanged.removeListener(onChanged);
        sendResponse(response);
      };
      const checkState = () => {
        chrome.downloads.search({ id }, results => {
          if (settled) return;
          const error = chrome.runtime.lastError;
          const item = results?.[0];
          if (error || !item) finish({ ok: false, id, error: error?.message || "下载任务不存在" });
          else if (item.state === "complete") finish({ ok: true, id, bytes: Math.max(0, item.fileSize || 0) });
          else if (item.state === "interrupted") finish({ ok: false, id, error: item.error || "下载已中断" });
        });
      };
      const onChanged = delta => {
        if (delta.id !== id) return;
        if (delta.state?.current === "interrupted") finish({ ok: false, id, error: delta.error?.current || "下载已中断" });
        else if (delta.state?.current === "complete") checkState();
      };
      chrome.downloads.onChanged.addListener(onChanged);
      // 监听前任务可能已经结束；进行中的任务继续等待真实终态。
      checkState();
    },
  );
  return true; // 异步响应
});

// 右键菜单：图片上「用 X Media 下载」→ 交给内容脚本解析推文上下文后下载
chrome.runtime.onInstalled?.addListener(() => {
  // 扩展重载/升级时旧菜单可能仍在，重复 id 会让 create 抛错；先清空再建
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "xmd-dl-image",
      title: "用 X Media 下载此图片",
      contexts: ["image"],
    });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "xmd-dl-image" && tab?.id && info.srcUrl) {
    chrome.tabs.sendMessage(tab.id, { type: "xmd-context-download", srcUrl: info.srcUrl }).catch(() => {});
  }
});

// ─── 订阅推送 v2：模拟真人 ───────────────────────────────────
// 不直调 API：alarm 唤醒后像真人一样逐个打开博主媒体页（后台标签），
// 随机停留等待页面自然加载，内容脚本在真实页面里跑推送管线，完事关页。
const SUB_ALARM = "xmd-sub";
const SUB_IDX_KEY = "xmd_sub_idx";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

async function readWatch() {
  const s = (await chrome.storage.local.get("xmd_settings_v1"))["xmd_settings_v1"] || {};
  return { enabled: false, intervalMin: 30, users: [], ...(s.watch || {}) };
}

// 推送结果日志：每次订阅访问记录「博主 + 新下载数 + 时间」，供设置页展示
const SUB_LOG_KEY = "xmd_sub_log";
async function recordPush(user, count) {
  try {
    const prev = (await chrome.storage.local.get(SUB_LOG_KEY))[SUB_LOG_KEY] || [];
    const log = [{ user, count, ts: Date.now() }, ...prev].slice(0, 50);
    await chrome.storage.local.set({ [SUB_LOG_KEY]: log });
  } catch { /* 忽略记录失败 */ }
}

async function syncAlarm() {
  const w = await readWatch();
  await chrome.alarms.clear(SUB_ALARM);
  if (w.enabled && w.users.length) {
    await chrome.alarms.create(SUB_ALARM, { periodInMinutes: Math.max(1, w.intervalMin) });
  }
}

chrome.runtime.onInstalled.addListener(() => { void syncAlarm(); });
chrome.runtime.onStartup.addListener(() => { void syncAlarm(); });

/** 真人式访问：开页 → 等加载 → 随机停留 → 推送 → 随机收尾 → 关页 */
async function visitAndPush(user) {
  let tab;
  try {
    tab = await chrome.tabs.create({
      url: `https://x.com/${encodeURIComponent(user)}/media`,
      active: false,
    });
  } catch {
    return;
  }
  await new Promise(res => {
    const f = (id, info) => {
      if (id !== tab.id || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(f);
      res();
    };
    chrome.tabs.onUpdated.addListener(f);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(f);
      res();
    }, 30000);
  });
  await sleep(rand(2000, 6000)); // 像人一样停留浏览
  let count = 0;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "xmd-run-push" });
    count = resp?.count || 0;
  } catch { /* 内容脚本未就绪等 */ }
  await recordPush(user, count);
  await sleep(rand(1500, 4000));
  try {
    await chrome.tabs.remove(tab.id);
  } catch { /* 已关 */ }
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== SUB_ALARM) return;
  const w = await readWatch();
  if (!w.enabled || !w.users.length) return;

  // 轮转：每周期最多 5 人，避免集中访问
  const prev = ((await chrome.storage.local.get(SUB_IDX_KEY))[SUB_IDX_KEY]) || 0;
  const batch = [];
  for (let k = 0; k < Math.min(5, w.users.length); k++) {
    batch.push(w.users[(prev + k) % w.users.length]);
  }
  await chrome.storage.local.set({ [SUB_IDX_KEY]: (prev + batch.length) % w.users.length });

  for (const user of batch) {
    await visitAndPush(user);
    await sleep(rand(4000, 12000)); // 人与人之间的随机间隔
  }
});

// 设置变更 → 重建 alarm
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "xmd-sub-sync") return false;
  void syncAlarm().then(() => sendResponse({ ok: true }));
  return true;
});

// 画廊页请求：后台开博主媒体页，加载完成后通知内容脚本跑推送管线
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "xmd-push-user") return false;
  (async () => {
    try {
      const tab = await chrome.tabs.create({
        url: `https://x.com/${encodeURIComponent(msg.user)}/media`,
        active: false,
      });
      chrome.tabs.onUpdated.addListener(function onUpd(tabId, info) {
        if (tabId !== tab.id || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpd);
        chrome.tabs.sendMessage(tab.id, { type: "xmd-run-push" }).catch(() => {});
      });
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});

// 桌面通知：下载完成且标签在后台时由内容脚本请求；点击通知跳回页面
const notifyUrls = new Map();
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type !== "xmd-notify") return false;
  const id = "xmd-n-" + Date.now();
  notifyUrls.set(id, msg.url || "");
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: msg.title || "X Media Downloader",
    message: msg.message || "",
  });
  return false;
});
chrome.notifications.onClicked.addListener(id => {
  const url = notifyUrls.get(id);
  if (url) chrome.tabs.create({ url });
  notifyUrls.delete(id);
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'xmd-download') return;
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  let started = false;

  port.onMessage.addListener(async msg => {
    const url = msg && msg.url;
    if (!url || typeof url !== 'string' || started) return;
    started = true;

    try {
      // 按媒体类型补 Accept 头：twimg 对缺省 Accept(*/*) 的图片请求可能返回空白/占位，
      // 与 <img> 一致用 image/* 才拿到真实图片字节
      const isImage = /(?:\.(?:jpe?g|png|webp|gif))(?:\?|$)|[?&]format=(?:jpe?g|png|webp|gif)/i.test(url);
      const res = await fetch(url, {
        credentials: 'omit',
        signal: controller.signal,
        headers: isImage
          ? { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
          : { accept: 'video/*,*/*;q=0.8' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('空响应');
      let bytes = 0;
      let chunks = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let offset = 0; offset < value.length; offset += 32768) {
          const part = value.subarray(offset, offset + 32768);
          port.postMessage({ type: 'xmd-media-chunk', index: chunks++, data: btoa(String.fromCharCode(...part)) });
          bytes += part.length;
        }
      }
      if (!bytes) throw new Error('空响应');
      port.postMessage({ type: 'xmd-media-end', chunks, bytes, mime: res.headers.get('content-type') || '' });
    } catch (e) {
      try {
        port.postMessage({ error: e.message || String(e) });
      } catch (_) {
        // 端口已断开
      }
    }
  });
});
