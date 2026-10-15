import { useState } from "react";
import { motion } from "motion/react";
import {
  ChevronLeft,
  ExternalLink,
  Heart,
  HelpCircle,
  Images,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Zap,
  Check,
  Copy,
} from "lucide-react";
import { useXmd } from "@/core/engine";
import { XLogo, GithubIcon } from "./icons";
import { EASE_SMOOTH_OUT } from "@/lib/ease";

const EXTENSION_VERSION = "7.7.0";

export function AboutView() {
  const setView = useXmd(s => s.setView);
  const [copied, setCopied] = useState(false);

  const handleCopyVersion = () => {
    const text = `X Media Downloader v${EXTENSION_VERSION} (${navigator.userAgent})`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: EASE_SMOOTH_OUT }}
      className="flex flex-col gap-3 pb-2 text-[var(--stage-fg)] select-none"
    >
      {/* 顶栏：返回主页 + 视图标题 */}
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => setView("main")}
          className="ib"
          title="返回主面板"
          aria-label="返回主面板"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <span className="flex-1 text-sm font-medium text-[var(--stage-fg)]">关于</span>
        <div className="flex items-center gap-1 rounded-full bg-[var(--soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--soft-ink)] tabular-nums">
          <span>v{EXTENSION_VERSION}</span>
        </div>
      </div>

      {/* 品牌英雄卡 (Brand Hero Card) */}
      <div className="flex flex-col items-center justify-center rounded-2xl bg-[var(--stage-surface)] p-4 text-center shadow-[0_0_0_1px_var(--stage-border),0_2px_8px_rgba(0,0,0,0.04)] relative overflow-hidden">
        {/* 背景微柔光 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--soft)]/20 via-transparent to-transparent pointer-events-none" />

        <div className="relative mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--stage-accent)] text-[var(--stage-on-accent)] shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
          <XLogo className="h-7 w-7" />
        </div>

        <h1 className="text-base font-medium tracking-tight text-[var(--stage-fg)]">
          X Media Downloader
        </h1>
        <p className="mt-0.5 text-xs text-[var(--stage-muted)] max-w-[260px] leading-relaxed">
          极致优雅的 X (Twitter) 媒体批量采集、拼图聚合与本地归档套件
        </p>

        <div className="mt-2.5 flex items-center gap-1.5 rounded-full bg-[var(--chip)] px-2.5 py-1 text-[10.5px] text-[var(--stage-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Chrome MV3 架构 · 运行就绪</span>
        </div>
      </div>

      {/* 核心特性速览 (Features Highlight) */}
      <div className="flex flex-col gap-1.5">
        <div className="px-1 text-[11px] font-medium text-[var(--stage-muted)]">
          核心特性
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-0.5 rounded-xl bg-[var(--stage-surface)] p-2.5 shadow-[0_0_0_1px_var(--stage-border)]">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--stage-fg)]">
              <Zap className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.75} />
              <span>无损原图</span>
            </div>
            <span className="text-[10px] text-[var(--stage-muted)] leading-tight">
              4K orig 原画与原生最高码率 MP4 视频提取
            </span>
          </div>

          <div className="flex flex-col gap-0.5 rounded-xl bg-[var(--stage-surface)] p-2.5 shadow-[0_0_0_1px_var(--stage-border)]">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--stage-fg)]">
              <Images className="h-3.5 w-3.5 text-blue-500" strokeWidth={1.75} />
              <span>多图拼图</span>
            </div>
            <span className="text-[10px] text-[var(--stage-muted)] leading-tight">
              1~4P 推文自适应宫格，一键全选同推媒体
            </span>
          </div>

          <div className="flex flex-col gap-0.5 rounded-xl bg-[var(--stage-surface)] p-2.5 shadow-[0_0_0_1px_var(--stage-border)]">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--stage-fg)]">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.75} />
              <span>智能正文命名</span>
            </div>
            <span className="text-[10px] text-[var(--stage-muted)] leading-tight">
              自动过滤非法字符，附带推文文字与序号
            </span>
          </div>

          <div className="flex flex-col gap-0.5 rounded-xl bg-[var(--stage-surface)] p-2.5 shadow-[0_0_0_1px_var(--stage-border)]">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--stage-fg)]">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" strokeWidth={1.75} />
              <span>动效引擎</span>
            </div>
            <span className="text-[10px] text-[var(--stage-muted)] leading-tight">
              蚀刻点阵、跑马灯画廊与赛博矩阵代码雨
            </span>
          </div>
        </div>
      </div>

      {/* 资源与社区链接 (Resources & Links - 占位) */}
      <div className="flex flex-col gap-1.5">
        <div className="px-1 text-[11px] font-medium text-[var(--stage-muted)]">
          开源与社区
        </div>

        <div className="flex flex-col divide-y divide-[var(--divider)] rounded-2xl bg-[var(--stage-surface)] shadow-[0_0_0_1px_var(--stage-border)] overflow-hidden">
          {/* GitHub 仓库链接 */}
          <button
            type="button"
            onClick={() => openUrl("https://github.com/example/x-media-downloader")}
            className="flex items-center justify-between gap-2 p-2.5 text-left hover:bg-[var(--chip)] transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--chip)] text-[var(--stage-fg)]">
                <GithubIcon className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-[var(--stage-fg)] group-hover:text-[var(--soft-ink)] transition-colors">
                  GitHub 源码仓库
                </span>
                <span className="text-[10.5px] text-[var(--stage-muted)] truncate">
                  开源代码、贡献 PR 或给项目点 Star
                </span>
              </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-[var(--stage-muted)] shrink-0" strokeWidth={1.5} />
          </button>

          {/* 问题与建议反馈 */}
          <button
            type="button"
            onClick={() => openUrl("https://github.com/example/x-media-downloader/issues")}
            className="flex items-center justify-between gap-2 p-2.5 text-left hover:bg-[var(--chip)] transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--chip)] text-amber-500">
                <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-[var(--stage-fg)] group-hover:text-[var(--soft-ink)] transition-colors">
                  问题反馈与功能建议
                </span>
                <span className="text-[10.5px] text-[var(--stage-muted)] truncate">
                  遇到 Bug 或有改进想法？提交 Issue
                </span>
              </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-[var(--stage-muted)] shrink-0" strokeWidth={1.5} />
          </button>

          {/* 扩展商店支持 */}
          <button
            type="button"
            onClick={() => openUrl("https://chromewebstore.google.com/detail/placeholder")}
            className="flex items-center justify-between gap-2 p-2.5 text-left hover:bg-[var(--chip)] transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--chip)] text-rose-500">
                <Heart className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-[var(--stage-fg)] group-hover:text-[var(--soft-ink)] transition-colors">
                  商店评分与支持
                </span>
                <span className="text-[10.5px] text-[var(--stage-muted)] truncate">
                  在 Chrome Web Store 给予五星好评
                </span>
              </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-[var(--stage-muted)] shrink-0" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 架构与版本规范 */}
      <div className="flex flex-col gap-1.5">
        <div className="px-1 text-[11px] font-medium text-[var(--stage-muted)]">
          环境与规范
        </div>
        <div className="rounded-2xl bg-[var(--stage-surface)] p-2.5 shadow-[0_0_0_1px_var(--stage-border)] flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--stage-muted)]">版本编号</span>
            <button
              onClick={handleCopyVersion}
              className="flex items-center gap-1 font-mono text-[11px] font-medium text-[var(--stage-fg)] hover:text-[var(--soft-ink)] transition-colors cursor-pointer"
            >
              <span>v{EXTENSION_VERSION}</span>
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" strokeWidth={2} />
              ) : (
                <Copy className="h-3 w-3 text-[var(--stage-muted)]" strokeWidth={1.5} />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--stage-muted)]">动效系统</span>
            <span className="text-[var(--stage-fg)] font-medium">Transitions.dev Motion Tokens</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--stage-muted)]">核心框架</span>
            <span className="text-[var(--stage-fg)] font-medium">React 19 · TypeScript · Vite</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--stage-muted)]">存储通道</span>
            <span className="text-[var(--stage-fg)] font-medium">File System Access · LocalStore</span>
          </div>
        </div>
      </div>

      {/* 免责与隐私声明 */}
      <div className="flex items-start gap-2 rounded-xl bg-[var(--chip)] p-2.5 text-[10.5px] text-[var(--stage-muted)] leading-relaxed">
        <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" strokeWidth={1.75} />
        <div>
          <span className="font-medium text-[var(--stage-fg)]">隐私承诺与免责声明</span>
          <p className="mt-0.5">
            本扩展为纯客户端本地运行，绝不上报或泄露任何个人隐私数据、浏览行为或 Cookie。所有抓取媒体均直接保存至您的设备。本软件遵循 MIT 协议开源，仅供个人技术研究与媒体归档学习使用。
          </p>
        </div>
      </div>
    </motion.div>
  );
}
