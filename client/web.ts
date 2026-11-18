import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
declare const document: {
  head: { appendChild(node: StyleNode): unknown };
  body: { appendChild(node: StyleNode): unknown };
  createElement(tag: "style"): StyleNode;
  createElement(tag: "input"): StyleNode;
};

interface StyleNode {
  id: string;
  textContent: string;
  type: string;
  value: string;
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  click(): void;
  remove(): void;
}

interface ProbeElement {
  querySelectorAll(selectors: string): { length: number };
}

let styleNode: StyleNode | null = null;

/** Replace the injected Markdown stylesheet. No-op away from the browser. */
export function applyMarkdownCss(css: string): void {
  if (Platform.OS !== "web") return;
  if (!css) {
    removeMarkdownCss();
    return;
  }
  if (!styleNode) {
    styleNode = document.createElement("style");
    styleNode.id = "paseo-markdown-styler";
    document.head.appendChild(styleNode);
  }
  styleNode.textContent = css;
}

export function removeMarkdownCss(): void {
  if (Platform.OS !== "web") return;
  styleNode?.remove();
  styleNode = null;
}

/** Count <mark> descendants; powers the highlight-support probe (web only). */
export function countDescendantMarks(container: unknown): number {
  if (Platform.OS !== "web") return 0;
  // The web View ref is the host element; plugin-side types cannot express DOM nodes.
  const element = container as ProbeElement | null;
  return element?.querySelectorAll("mark").length ?? 0;
}

/**
 * Open the platform colour picker and report the chosen colour.
 *
 * React Native Web has no colour input, so this drives a real `<input
 * type="color">` off-document. It returns a cancel function; call it on unmount
 * so a picker left open cannot call back into a dead component. Returns the
 * cancel function, or null where the platform has no picker.
 */
export function pickColor(current: string, onPick: (value: string) => void): (() => void) | null {
  if (Platform.OS !== "web") return null;
  const input = document.createElement("input");
  input.type = "color";
  if (input.type !== "color") return null;
  // Some browsers ignore click() on a detached input, so the element is hidden
  // off-screen instead. The control cannot express alpha, so it is dropped.
  input.value = /^#[0-9a-fA-F]{6}/.test(current) ? current.slice(0, 7) : "#000000";
  input.style.setProperty("position", "fixed");
  input.style.setProperty("left", "-9999px");
  input.style.setProperty("width", "1px");
  input.style.setProperty("height", "1px");
  input.style.setProperty("opacity", "0");
  const changed = () => {
    onPick(input.value);
    input.removeEventListener("change", changed);
    input.remove();
  };
  input.addEventListener("change", changed);
  document.body.appendChild(input);
  input.click();
  return () => {
    input.removeEventListener("change", changed);
    input.remove();
  };
}
