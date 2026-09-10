# 阶段 00：Corepack 与 pnpm 初始化

[返回学习目录](../README.md) · [下一阶段](01-typescript.md)

状态：已完成（你已确认安装成功）。本文件归档此前操作，不需要重新初始化。

## 目标

创建 package.json，使用 Corepack 选择 pnpm，并对齐两处包管理器版本要求。

## 操作记录

### 1. 启用 Corepack

先检查 Corepack 是否可用：

```bash
corepack --version
```

如果提示找不到命令，先安装（Node.js 25 起不再自带 Corepack）：

```bash
npm install -g corepack
```

然后启用 pnpm 命令入口：

```bash
corepack enable pnpm
```

### 2. 初始化项目并固定 pnpm 版本

在当前练习目录 `ink-agent-from-scratch/` 中运行：

```bash
corepack pnpm@12.3.4 init
corepack use pnpm@12.3.4
```

如果已经有 `package.json`，跳过第一条命令。先检查下面的版本要求，再执行第二条命令。

第一条命令通过 Corepack 使用指定的 pnpm 版本创建 `package.json`；第二条命令把该版本写入 `packageManager` 字段，并执行依赖安装。教程固定使用 `12.3.4`，以后 Corepack 会依据该字段选择项目使用的版本。

如果 `package.json` 同时包含 `devEngines.packageManager`，它的版本要求必须与 `packageManager` 一致。本项目设置为：

```json
"devEngines": {
  "packageManager": {
    "name": "pnpm",
    "version": "12.3.4",
    "onFail": "error"
  }
}
```

例如，`packageManager` 指定 `pnpm@12.3.4`，而 `devEngines.packageManager.version` 仍是 `^11.18.0`，就会触发 `ERR_PNPM_BAD_PM_VERSION`。应对齐版本后重试，不必关闭版本检查。Corepack 写入版本后附带的校验哈希可以保留。

这里由 Corepack 负责选择和下载 pnpm；`onFail: "error"` 让 pnpm 在版本不匹配时明确报错。

### 3. 检查结果

```bash
pnpm --version
```

打开 `package.json`，检查 `packageManager` 中的 pnpm 版本是否与输出一致。这个文件还会记录项目名称、运行命令和依赖；初始化尚不会调用模型。


## 本阶段产物

- `package.json`：项目元数据，pnpm 固定为 12.3.4。
- `pnpm-lock.yaml`：依赖锁文件，纳入版本管理。
- `.gitignore`：忽略 node_modules、.env 等本地文件。

此前版本冲突已通过对齐 packageManager 与 devEngines.packageManager 解决。

参考：[Corepack 官方说明](https://github.com/nodejs/corepack) · [pnpm init 文档](https://pnpm.io/cli/init)。
