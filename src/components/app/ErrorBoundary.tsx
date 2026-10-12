"use client";
import React from "react";
import { AlertTriangle, RotateCw, ChevronLeft } from "lucide-react";

interface State {
  error: Error | null;
  resetKey: number;
}

// Per-screen error boundary — a crash in one screen shows a recovery card
// instead of a blank page or a stuck skeleton.
export class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode; screenKey: string; onBack?: () => void },
  State
> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[STRIDE] screen error:", error);
  }

  componentDidUpdate(prev: { screenKey: string }) {
    if (prev.screenKey !== this.props.screenKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60dvh] px-8 text-center">
          <span className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
            <AlertTriangle size={28} />
          </span>
          <h2 className="text-[17px] font-bold">Something went wrong</h2>
          <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed max-w-[240px]">
            This screen hit an unexpected error. Your data is safe — try again or go back.
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => this.setState({ error: null, resetKey: this.state.resetKey + 1 })}
              className="h-11 px-5 rounded-lg bg-primary text-primary-foreground font-bold text-[14px] flex items-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <RotateCw size={15} /> Try again
            </button>
            {this.props.onBack && (
              <button
                onClick={this.props.onBack}
                className="h-11 px-5 rounded-lg border border-border font-bold text-[14px] flex items-center gap-1.5"
              >
                <ChevronLeft size={15} /> Go back
              </button>
            )}
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
