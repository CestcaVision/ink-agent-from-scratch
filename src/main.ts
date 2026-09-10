import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
const rl = createInterface({
  input: stdin,
  output: stdout,
  prompt: "你 > ",
});

rl.prompt();

for await (const line of rl) {
  console.log(`回声：${line}`);
  rl.prompt();
}