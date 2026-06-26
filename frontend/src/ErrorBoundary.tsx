import { Component, type ReactNode } from "react";

interface Props { fallback: ReactNode; children: ReactNode }
interface State { failed: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("Map crashed, using fallback board:", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
