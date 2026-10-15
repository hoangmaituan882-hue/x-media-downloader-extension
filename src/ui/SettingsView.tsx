// 设置视图：命名规则 / 文件夹策略 / 页内按钮 / 下载行为，全部实时预览。

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, Reorder } from "motion/react";
import {
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Clock,
  FileText,
  Fingerprint,
  Folder,
  GripVertical,
  Hash,
  Plus,
  RotateCcw,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { DURATION_FAST, DURATION_QUICK, EASE_SMOOTH_OUT } from "@/lib/ease";
import { useXmd } from "@/core/engine";
import { Button } from "@/components/motion/button";
import { Switch } from "@/components/motion/switch";
import { Input } from "@/components/motion/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { HoldActionButton } from "@/components/motion/hold-action-button";
import { buildFileName, folderSegments } from "@/core/naming";
import { getHistory, replaceAllHistory } from "@/core/history";
import { dumpSeq, replaceAllSeq } from "@/core/store";
import {
  DEFAULT_SETTINGS, NAMING_PRESETS, mergeSettings, saveSettings,
  type AnimThemeId, type FolderMode,
} from "@/core/settings";
import { ANIM_THEMES } from "@/ui/anim/themes";
import { cn } from "@/lib/utils";

const TRIGGER_CLS = "px-3 py-1 text-[12px]";

interface NamingTokenMeta {
  key: string;
  label: string;
  icon: typeof User;
  color: string;
  badge: string;
  sample: string;
}

const ALL_NAMING_TOKENS: NamingTokenMeta[] = [
  { key: "user", label: "博主名", icon: User, color: "text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10", badge: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40", sample: "elonmusk" },
  { key: "date", label: "发布日期", icon: Calendar, color: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10", badge: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40", sample: "2025-05-18" },
  { key: "seq", label: "当天序号", icon: Hash, color: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10", badge: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40", sample: "001" },
  { key: "text", label: "推文正文", icon: FileText, color: "text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10", badge: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40", sample: "星舰发射圆满成功" },
  { key: "time", label: "时分秒", icon: Clock, color: "text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10", badge: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40", sample: "14-30-22" },
  { key: "id", label: "推文ID", icon: Fingerprint, color: "text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10", badge: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40", sample: "179234" },
  { key: "month", label: "归档月份", icon: CalendarDays, color: "text-teal-600 dark:text-teal-400 border-teal-500/30 bg-teal-500/10", badge: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40", sample: "2025-05" },
];

const TOKEN_MAP = new Map(ALL_NAMING_TOKENS.map(t => [t.key, t]));

const SEPARATORS = [
  { id: "_", label: "下划线 _" },
  { id: "-", label: "连字符 -" },
  { id: " ", label: "空格" },
  { id: ".", label: "点号 ." },
];

function NamingTagEditor({
  template,
  onChange,
}: {
  template: string;
  onChange: (v: string) => void;
}) {
  const activeTokens = useMemo(() => {
    const matches = [...template.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map(m => m[1]);
    return matches.length > 0 ? matches : ["date", "seq"];
  }, [template]);

  const currentSep = useMemo(() => {
    if (template.includes("-") && !template.includes("_")) return "-";
    if (template.includes(" ")) return " ";
    if (template.includes(".")) return ".";
    return "_";
  }, [template]);

  const commit = (tokens: string[], sep = currentSep) => {
    const list = tokens.length > 0 ? tokens : ["date", "seq"];
    onChange(list.map(t => `{${t}}`).join(sep));
  };

  const handleReorder = (newOrder: string[]) => {
    commit(newOrder);
  };

  const handleRemove = (key: string) => {
    if (activeTokens.length <= 1) return;
    commit(activeTokens.filter(k => k !== key));
  };

  const handleAdd = (key: string) => {
    if (activeTokens.includes(key)) return;
    commit([...activeTokens, key]);
  };

  const availableTokens = ALL_NAMING_TOKENS.filter(t => !activeTokens.includes(t.key));

  return (
    <div className="flex flex-col gap-2.5">
      {/* 预设方案切换 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {NAMING_PRESETS.map(p => {
          const isSelected = p.template === template;
          return (
            <button
              key={p.template}
              type="button"
              onClick={() => onChange(p.template)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-[background-color,color,transform] duration-150 active:scale-95 cursor-pointer select-none",
                isSelected
                  ? "bg-[var(--stage-accent)] text-[var(--stage-on-accent)] shadow-xs font-semibold"
                  : "bg-[var(--chip)] text-[var(--stage-muted)] hover:text-[var(--stage-fg)] hover:bg-[var(--chip-hover)]",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 拖拽标签排序画板 */}
      <div className="rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] p-2.5 shadow-xs flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-[var(--stage-muted)]">
          <span className="flex items-center gap-1 font-medium text-[var(--stage-fg)]">
            <GripVertical className="h-3 w-3 text-zinc-400" />
            命名标签序列（按住拖拽排序）
          </span>
          {/* 分隔符微调 */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-400">连接符:</span>
            <div className="flex rounded-md bg-[var(--chip)] p-0.5">
              {SEPARATORS.map(sep => (
                <button
                  key={sep.id}
                  type="button"
                  onClick={() => commit(activeTokens, sep.id)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors",
                    currentSep === sep.id
                      ? "bg-[var(--stage-surface)] text-[var(--stage-fg)] font-bold shadow-xs"
                      : "text-[var(--stage-muted)] hover:text-[var(--stage-fg)]",
                  )}
                  title={sep.label}
                >
                  {sep.id === " " ? "空" : sep.id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 标签拖拽行 */}
        <Reorder.Group
          axis="x"
          values={activeTokens}
          onReorder={handleReorder}
          className="flex flex-wrap items-center gap-1.5 min-h-[42px] p-2 rounded-lg bg-[var(--stage-gray)] border border-dashed border-[var(--stage-border)]"
        >
          {activeTokens.map((tokenKey, index) => {
            const meta = TOKEN_MAP.get(tokenKey) || {
              key: tokenKey,
              label: tokenKey,
              icon: Hash,
              color: "text-zinc-600 border-zinc-400/20 bg-zinc-200/40",
              badge: "text-zinc-600 bg-zinc-100",
              sample: tokenKey,
            };
            const Icon = meta.icon;

            return (
              <Fragment key={tokenKey}>
                {index > 0 && (
                  <span className="text-xs font-mono font-bold text-zinc-400 select-none px-0.5">
                    {currentSep}
                  </span>
                )}
                <Reorder.Item
                  value={tokenKey}
                  id={tokenKey}
                  className="relative group cursor-grab active:cursor-grabbing select-none"
                  whileDrag={{ scale: 1.08, zIndex: 30 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_SMOOTH_OUT }}
                >
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border shadow-xs transition-shadow duration-150 bg-[var(--stage-surface)]",
                      meta.color,
                      "hover:shadow-sm",
                    )}
                  >
                    <Icon className="h-3 w-3 shrink-0 opacity-80" />
                    <span>{meta.label}</span>
                    {activeTokens.length > 1 && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleRemove(tokenKey);
                        }}
                        className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        title="移除此标签"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </Reorder.Item>
              </Fragment>
            );
          })}
        </Reorder.Group>

        {/* 备选标签资源池 */}
        {availableTokens.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[10px] text-zinc-400 mr-1 flex items-center gap-0.5">
              <Plus className="h-3 w-3" /> 添加:
            </span>
            {availableTokens.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleAdd(t.key)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border border-dashed border-[var(--stage-border)] bg-[var(--stage-surface)] text-[var(--stage-muted)] hover:text-[var(--stage-fg)] hover:border-zinc-400 hover:scale-102 active:scale-96 transition-[transform,color,border-color] duration-150"
                >
                  <Icon className="h-2.5 w-2.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 实时彩色映射输出沙盒 */}
      <div className="rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] p-2.5 flex flex-col gap-1.5 shadow-xs">
        <div className="flex items-center justify-between text-[11px] text-[var(--stage-muted)]">
          <span className="flex items-center gap-1 font-medium text-[var(--stage-fg)]">
            <Folder className="h-3.5 w-3.5 text-amber-500" />
            实时效果所见即所得
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">动态映射</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs overflow-x-auto py-1">
          <FileText className="h-4 w-4 text-violet-500 shrink-0" />
          <div className="flex items-center flex-wrap gap-0.5">
            {activeTokens.map((k, i) => {
              const meta = TOKEN_MAP.get(k);
              return (
                <Fragment key={k}>
                  {i > 0 && <span className="text-zinc-400 font-bold px-0.5">{currentSep}</span>}
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded text-[11px] font-semibold",
                      meta ? meta.badge : "text-zinc-600 bg-zinc-100",
                    )}
                    title={meta?.label}
                  >
                    {meta ? meta.sample : k}
                  </span>
                </Fragment>
              );
            })}
            <span className="text-zinc-400 font-normal">.jpg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsView() {
  const s = useXmd();
  const st = useMemo(() => mergeSettings(DEFAULT_SETTINGS, s.settings || {}), [s.settings]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<string | null>("naming");
  const [newUser, setNewUser] = useState("");
  const [subLog, setSubLog] = useState<{ user: string; count: number; ts: number }[]>([]);

  // 读取订阅推送记录
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    chrome.storage.local.get("xmd_sub_log").then(r => {
      setSubLog((r["xmd_sub_log"] as { user: string; count: number; ts: number }[]) || []);
    }).catch(() => {});
  }, []);

  const timeAgo = (ts: number) => {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.floor(h / 24);
    return d === 1 ? "昨天" : `${d} 天前`;
  };

  // 订阅设置变更 → 通知 background 重建 alarm
  const updWatch = (p: Partial<typeof st.watch>) => {
    s.setSettings({ watch: p });
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: "xmd-sub-sync" }).catch(() => {});
    }
  };
  const toggle = (id: string) => setOpen(open === id ? null : id);
  const sec = (id: string) => ({ open: open === id, onToggle: () => toggle(id) });

  // 实时预览用的样例上下文
  const sample = {
    username: "nakano_miku",
    tweetTime: new Date(2026, 7, 20, 14, 30, 5),
    seq: 3,
    tweetId: "1958123456789012345",
    tweetText: "中野三玖角色壁纸 夏日海滩摄影特辑",
  };
  const previewName = buildFileName(st.naming.template, sample, "https://pbs.twimg.com/media/x.jpg?format=jpg", "image", st);
  const previewPath = folderSegments(st, sample).join("/") || "（根目录）";

  return (
    <div>
      {/* 顶栏：返回 + 恢复默认 */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => s.setView("main")}
          className="ib"
          title="返回主面板"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <span className="flex-1 text-sm font-medium text-[var(--stage-fg)]">设置</span>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full px-2.5 text-xs font-medium text-[var(--stage-muted)] hover:text-[var(--stage-fg)]"
          onClick={() => s.setSettings(structuredClone(DEFAULT_SETTINGS))}
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
          恢复默认
        </Button>
      </div>

      {/* 命名规则 */}
      <Section title="文件命名" {...sec('naming')}>
        <NamingTagEditor
          template={st.naming.template}
          onChange={v => s.setSettings({ naming: { template: v } })}
        />
        <div className="mt-2.5 divide-y divide-[var(--divider)]">
          <Row label="包含推文文字" desc="在文件名附带发推正文（自动过滤链接、Emoji 与非法字符）">
            <Switch
              checked={st.naming.includeText ?? true}
              onCheckedChange={v => s.setSettings({ naming: { includeText: v } })}
              ariaLabel="包含推文文字"
            />
          </Row>
          {(st.naming.includeText ?? true) && (
            <Row label="文本字数上限" desc="超出截断并保留前 N 字（10~80 字）">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={5}
                  value={st.naming.maxTextLength ?? 30}
                  onChange={e => s.setSettings({ naming: { maxTextLength: Number(e.target.value) } })}
                  className="w-20 accent-[var(--stage-accent)] cursor-pointer"
                />
                <span className="w-8 text-right text-xs font-medium text-[var(--stage-fg)] tabular-nums">
                  {st.naming.maxTextLength ?? 30}字
                </span>
              </div>
            </Row>
          )}
        </div>
      </Section>

      {/* 文件夹策略 */}
      <Section title="文件夹" {...sec('folders')}>
        <Tabs
          variant="segment"
          value={st.folders.mode}
          onValueChange={v => s.setSettings({ folders: { mode: v as FolderMode } })}
        >
          <TabsList>
            <TabsTrigger value="none" className={TRIGGER_CLS}>不建</TabsTrigger>
            <TabsTrigger value="username" className={TRIGGER_CLS}>按博主</TabsTrigger>
            <TabsTrigger value="month" className={TRIGGER_CLS}>按月份</TabsTrigger>
            <TabsTrigger value="user-month" className={TRIGGER_CLS}>博主/月份</TabsTrigger>
            <TabsTrigger value="custom" className={TRIGGER_CLS}>自定义</TabsTrigger>
          </TabsList>
        </Tabs>
        {st.folders.mode === "custom" && (
          <div className="mt-2 flex flex-col gap-1.5">
            <Input
              value={st.folders.customTemplate}
              onChange={v => s.setSettings({ folders: { customTemplate: v } })}
              placeholder="{user}/{month}（/ 分层）"
            />
            {/* 快速标签插入 */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-zinc-400">快速插入:</span>
              {[
                { tag: "{user}", label: "博主名" },
                { tag: "{month}", label: "月份" },
                { tag: "{date}", label: "日期" },
              ].map(t => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => {
                    const current = (st.folders.customTemplate || "").trim();
                    const next = current ? `${current}/${t.tag}` : t.tag;
                    s.setSettings({ folders: { customTemplate: next } });
                  }}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium border border-dashed border-[var(--stage-border)] bg-[var(--stage-surface)] text-[var(--stage-muted)] hover:text-[var(--stage-fg)] hover:scale-102 active:scale-96 transition-all"
                >
                  +{t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Preview label="目录结构" value={previewPath} />
        <div className="mt-1 text-[10px] text-zinc-400">
          未选文件夹时通过浏览器下载目录自动建子目录；主面板的子文件夹输入优先覆盖此设置。
        </div>
      </Section>

      {/* 页内按钮 */}
      <Section title="页内下载按钮" {...sec('inline')}>
        <Row label="启用图片/视频 hover 下载按钮">
          <Switch checked={st.inline.enabled} onCheckedChange={v => s.setSettings({ inline: { enabled: v } })} ariaLabel="启用页内按钮" />
        </Row>
        <Row label="仅悬停时显示（关闭则常显）" dim={!st.inline.enabled}>
          <Switch checked={st.inline.hoverOnly} onCheckedChange={v => s.setSettings({ inline: { hoverOnly: v } })} ariaLabel="悬停显示" />
        </Row>
        <Row label="视频 / GIF 上也显示" dim={!st.inline.enabled}>
          <Switch checked={st.inline.onVideos} onCheckedChange={v => s.setSettings({ inline: { onVideos: v } })} ariaLabel="视频按钮" />
        </Row>
        <Row label="右键菜单「用 X Media 下载」">
          <Switch checked={st.inline.contextMenu} onCheckedChange={v => s.setSettings({ inline: { contextMenu: v } })} ariaLabel="右键菜单" />
        </Row>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">点击行为</span>
          <Tabs
            variant="segment"
            value={st.inline.clickAction}
            onValueChange={v => s.setSettings({ inline: { clickAction: v as "download" | "queue" } })}
          >
            <TabsList>
              <TabsTrigger value="download" className={TRIGGER_CLS}>直接下载</TabsTrigger>
              <TabsTrigger value="queue" className={TRIGGER_CLS}>加入队列</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Section>

      {/* 下载行为 */}
      <Section title="下载" {...sec('download')}>
        <Row label="跳过已下载过的媒体">
          <Switch
            checked={st.download.skipDownloaded}
            onCheckedChange={v => s.setSettings({ download: { skipDownloaded: v } })}
            ariaLabel="跳过已下载"
          />
        </Row>
        <Row label="失败自动重试一次">
          <Switch checked={st.download.retry} onCheckedChange={v => s.setSettings({ download: { retry: v } })} ariaLabel="自动重试" />
        </Row>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">并发数</span>
          <Tabs
            variant="segment"
            value={String(st.download.concurrency)}
            onValueChange={v => s.setSettings({ download: { concurrency: parseInt(v, 10) || 3 } })}
          >
            <TabsList>
              {[1, 3, 5].map(n => (
                <TabsTrigger key={n} value={String(n)} className={TRIGGER_CLS}>
                  {n}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">视频画质</span>
          <Tabs
            variant="segment"
            value={st.download.videoQuality}
            onValueChange={v => s.setSettings({ download: { videoQuality: v as typeof st.download.videoQuality } })}
          >
            <TabsList>
              {(
                [
                  ["max", "最高"],
                  ["balanced", "平衡"],
                  ["save", "省流"],
                ] as const
              ).map(([id, label]) => (
                <TabsTrigger key={id} value={id} className={TRIGGER_CLS}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">日期范围</span>
          <Tabs
            variant="segment"
            value={String(st.download.maxAgeDays)}
            onValueChange={v => s.setSettings({ download: { maxAgeDays: parseInt(v, 10) || 0 } })}
          >
            <TabsList>
              {(
                [
                  [0, "不限"],
                  [7, "7天"],
                  [30, "30天"],
                  [90, "90天"],
                ] as const
              ).map(([n, label]) => (
                <TabsTrigger key={n} value={String(n)} className={TRIGGER_CLS}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </Section>

      {/* 悬浮卡 */}
      <Section title="悬浮卡" {...sec('float')}>
        <Row label="博主主页显示悬浮卡">
          <Switch
            checked={st.float.enabled}
            onCheckedChange={v => s.setSettings({ float: { enabled: v } })}
            ariaLabel="悬浮卡"
          />
        </Row>
        <Row label="显示待更新数（静默预检）" dim={!st.float.enabled}>
          <Switch
            checked={st.float.showPending}
            onCheckedChange={v => s.setSettings({ float: { showPending: v } })}
            ariaLabel="待更新数"
          />
        </Row>
      </Section>

      {/* 数据管理：破坏性操作收进设置，长按确认防误触 */}
      <Section title="下载动画" {...sec('anim')}>
        <Row label="下载时启用下载动画">
          <Switch
            checked={st.anim.enabled}
            onCheckedChange={v => s.setSettings({ anim: { enabled: v } })}
            ariaLabel="下载动画"
          />
        </Row>
        <Row label="主题" dim={!st.anim.enabled}>
          <Tabs
            variant="segment"
            value={st.anim.theme}
            onValueChange={v => s.setSettings({ anim: { theme: v as AnimThemeId } })}
          >
            <TabsList>
              {ANIM_THEMES.map(t => (
                <TabsTrigger key={t.id} value={t.id} className={TRIGGER_CLS}>
                  {t.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </Row>
      </Section>

      <Section title="订阅推送" {...sec('watch')}>
        <Row label="启用订阅推送（模拟真人定时访问）">
          <Switch
            checked={st.watch.enabled}
            onCheckedChange={v => updWatch({ enabled: v })}
            ariaLabel="订阅推送"
          />
        </Row>
        <Row label="检查间隔" dim={!st.watch.enabled}>
          <Tabs
            variant="segment"
            value={String(st.watch.intervalMin)}
            onValueChange={v => updWatch({ intervalMin: parseInt(v, 10) || 30 })}
          >
            <TabsList>
              {[15, 30, 60].map(n => (
                <TabsTrigger key={n} value={String(n)} className={TRIGGER_CLS}>
                  {n}分
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </Row>
        <Row label={`关注列表（${st.watch.users.length}）· 每周期轮转 5 人`} dim={!st.watch.enabled}>
          <input
            value={newUser}
            onChange={e => setNewUser(e.target.value)}
            placeholder="博主用户名…"
            className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 outline-none focus:border-zinc-400"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const u = newUser.trim().replace(/^@/, "");
              if (!u || st.watch.users.includes(u)) return;
              updWatch({ users: [...st.watch.users, u] });
              setNewUser("");
            }}
          >
            添加
          </Button>
        </Row>
        {st.watch.users.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {st.watch.users.map(u => (
              <button
                key={u}
                onClick={() => updWatch({ users: st.watch.users.filter(x => x !== u) })}
                title="移除关注"
                className="flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:border-red-300 hover:text-red-600"
              >
                {u} <X className="h-2.5 w-2.5" />
              </button>
            ))}
          </div>
        )}
        {subLog.length > 0 && (
          <div className="mt-2 rounded-md border border-zinc-100 bg-zinc-50/60 p-2">
            <div className="mb-1 text-[10px] font-semibold text-zinc-400">最近推送</div>
            <div className="flex flex-col gap-1">
              {subLog.slice(0, 5).map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-zinc-700">@{l.user}</span>
                  <span className={l.count > 0 ? "shrink-0 font-semibold text-emerald-600" : "shrink-0 text-zinc-400"}>
                    {l.count > 0 ? `+${l.count}` : "无新"}
                  </span>
                  <span className="shrink-0 text-zinc-400">{timeAgo(l.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="数据管理" {...sec('data')}>
        <Row label="备份（历史+计数+设置）">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const data = {
                version: 1,
                ts: Date.now(),
                history: getHistory(),
                seq: dumpSeq(),
                settings: st,
              };
              const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `xmd-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 5000);
              s.toast("已导出备份", "success");
            }}
          >
            导出
          </Button>
        </Row>
        <Row label="从备份文件恢复">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            导入
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              f.text()
                .then(async txt => {
                  const d = JSON.parse(txt);
                  if (d.history) await replaceAllHistory(d.history);
                  if (d.seq) await replaceAllSeq(d.seq);
                  if (d.settings) saveSettings(mergeSettings(DEFAULT_SETTINGS, d.settings));
                  s.toast("恢复成功，即将重载", "success");
                  setTimeout(() => location.reload(), 800);
                })
                .catch(() => s.toast("备份文件解析失败", "error"));
            }}
          />
        </Row>
        <Row label={`下载历史（${getHistory().length} 条）`}>
          <HoldActionButton
            holdDuration={800}
            onHoldComplete={s.clearHistoryAll}
            holdingLabel="按住确认"
            completeLabel="已清空"
            labelClassName="text-[10.5px]"
            className="h-7 min-w-0 shrink-0 rounded-md border border-red-200 bg-transparent px-2.5 text-red-600"
            style={{ "--hold-radius": "0.375rem" } as React.CSSProperties}
          >
            清空
          </HoldActionButton>
        </Row>
        <Row label={`跳过记录（${s.storeCount} 条）`}>
          <HoldActionButton
            holdDuration={800}
            onHoldComplete={s.clearStore}
            holdingLabel="按住确认"
            completeLabel="已清空"
            labelClassName="text-[10.5px]"
            className="h-7 min-w-0 shrink-0 rounded-md border border-red-200 bg-transparent px-2.5 text-red-600"
            style={{ "--hold-radius": "0.375rem" } as React.CSSProperties}
          >
            清空
          </HoldActionButton>
        </Row>
      </Section>
    </div>
  );
}

/** 手风琴分区：layout 动画平滑推开/收回，与历史榜同一动效语言 */
function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      layout
      transition={{ duration: DURATION_FAST, ease: EASE_SMOOTH_OUT }}
      className="mb-2 border-b border-[var(--divider)] pb-2 last:mb-0 last:border-b-0"
    >
      <button className="xset-hd" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200 text-[var(--stage-muted)]", open && "rotate-180")}
          style={{ transitionDuration: "var(--acc-chevron, 250ms)", transitionTimingFunction: "var(--acc-ease, cubic-bezier(0.22, 1, 0.36, 1))" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="c"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: { duration: DURATION_FAST, ease: EASE_SMOOTH_OUT },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: DURATION_QUICK, ease: EASE_SMOOTH_OUT },
            }}
            style={{ overflow: "hidden" }}
          >
            <div className="pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Row({ label, children, dim, desc }: { label: string; children: React.ReactNode; dim?: boolean; desc?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2 py-1", dim && "opacity-50")}>
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-[var(--stage-fg)]">{label}</span>
        {desc && <span className="text-[10.5px] text-[var(--stage-muted)] leading-tight">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div className="my-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] px-3 py-2 text-xs shadow-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-[11px] font-medium text-[var(--stage-muted)] shrink-0">{label}:</span>
        <span className="truncate font-mono text-xs font-semibold text-[var(--stage-fg)]">{value}</span>
      </div>
    </div>
  );
}
