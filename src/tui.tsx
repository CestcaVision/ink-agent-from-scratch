import { render } from "ink";
import { App } from "./tui/App.js";

if (!process.stdin.isTTY) {
  throw new Error("请在 VS Code 终端等交互式终端中运行 pnpm run tui。");
}

const app = render(<App />);
await app.waitUntilExit();