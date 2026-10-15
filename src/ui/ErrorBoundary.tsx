// 错误边界：面板/画廊崩溃时显示恢复 UI，而不是整片白屏。

import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { err: Error | null }
> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            fontFamily: "-apple-system, 'Segoe UI', 'Noto Sans SC', sans-serif",
            color: "#18181b",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            {this.props.label || "界面"}出了点问题
          </div>
          <code style={{ display: "block", fontSize: 11, color: "#71717a", marginBottom: 12, wordBreak: "break-all" }}>
            {String(this.state.err.message || this.state.err)}
          </code>
          <button
            onClick={() => location.reload()}
            style={{
              border: 0,
              borderRadius: 8,
              background: "#18181b",
              color: "#fff",
              padding: "8px 18px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
