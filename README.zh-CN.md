# Markdown Styler

[English](README.md) · 简体中文

<img src="assets/icon.png" alt="Markdown Styler icon" width="128" height="128" />

![Markdown Styler 设置页与实时预览](assets/screenshot.webp)

一个 [Paseo](https://paseo.sh) 插件，在不替换内置渲染器的前提下调整 Paseo 应用中 Markdown 的渲染样式：逐元素配色、标题字号与自定义 CSS。设置页内置实时预览，通过 Paseo 自身的 Markdown 管线渲染。

> **这是 [Moyf/paseo-markdown-styler](https://github.com/Moyf/paseo-markdown-styler) 的改造版**，原作者为 [Moyf](https://github.com/Moyf)。原插件的设计思路与「注入样式表而非替换渲染器」的实现方式均出自该作者。差异见[本改造版改了什么](#本改造版改了什么)；若你只需要原本那四个颜色字段的能力，装原版即可。

## 与替换式插件的区别

Beautiful Chat、Better Paseo 这类插件会**替换**内置聊天渲染器，改用自己的一套实现，因此上游每一次渲染改进都必须由插件重新实现后才能出现。Markdown Styler 走的是相反的路：它**保留 Paseo 原生聊天视图作为渲染器**，只在上面注入一段样式表。

具体表现为：

- 更新 Paseo 后，新特性立刻出现在你的聊天里——Mermaid 图表、工作区文件链接与图片、原生文本选择、表格、任务列表、提示块、时间线改进——无需等待，也不会缺失。
- 没有另一套 Markdown 管线要维护，插件不会落后于 Paseo 版本，也不会与之失配。
- 代价是：样式能力受限于 CSS 在原生输出上能表达的范围。如果你想要完全不同的聊天布局（紧凑的工具行、自定义卡片、任务看板），替换式插件如 Beautiful Chat 才是合适的工具；若你希望**自己的** Markdown 样式始终跟随最新 Paseo，这个更轻。

## 本改造版改了什么

上游插件只暴露四个写死的颜色（标题、加粗、高亮的文字色与高亮背景色）。本改造版把它换成完整的逐元素系统：

- **26 个元素，各自配色。** 渲染器实际产出的每个块级、行内、列表与表格元素都能单独指定文字颜色，其中自带背景的元素还可单独指定背景色。选择器是从应用 bundle 自身的 `blockRenderers` / `inlineRenderers` / `listRenderers` / `tableRenderers` 实读出来的，不是猜的。
- **预设。** 六套内置外观（One Dark、Catppuccin、Dracula、Tokyo Night、Nord、Gruvbox，调色板与应用代码高亮主题同源），外加最多 24 个你自己的预设。一个预设存的是整套外观；预设处于使用中状态时，改动会写回该预设。
- **系统色盘。** 每个颜色字段除色板与十六进制输入外，还多一个系统取色按钮。
- **两列设置布局**，会突破页面默认的内容宽度上限；配色列与右侧上下两块各自独立滚动。
- **修复了原版保存路径的数据丢失 bug。** 连续快速点色板时，每次都用渲染闭包里的旧值写入，compare-and-swap 冲突导致只有最后一次改动落盘。现在保存是单飞（single-flight）加防抖。
- **schema v3**，带 v1/v2 旧设置的迁移，已有配置可继续沿用。

元素注册表、预设纯函数与 CSS 生成器在 `shared/style.ts`；全部 UI 在 `client/settings-screen.tsx`。

因为选择器直接映射 Paseo 的 DOM 结构，如果某个 Paseo 版本重构了 Markdown 渲染器，对应规则可能静默失效。某个样式突然不生效时，先看注册表。

## 安装

```bash
paseo plugin add git:Tunging/paseo-markdown-styler
```

改造版在默认分支 `custom-styling` 上，所以上面这条装的就是改造版。若要显式钉住某个 ref：

```bash
paseo plugin add git:Tunging/paseo-markdown-styler --ref custom-styling
```

需要 Paseo `>=0.14.0`。裸的 `owner/repo` 写法对**本仓库不适用**——daemon 会把那种写法当成插件注册表引用，而本插件并未发布到 Paseo 注册表。请使用 `git:` 前缀。

或者从本地目录安装：

```bash
paseo plugin install /absolute/path/to/paseo-markdown-styler
```

想装未经改造的原版：

```bash
paseo plugin add git:Moyf/paseo-markdown-styler
```

## 开发

```bash
npm install
npm run typecheck
paseo plugin reload paseo-markdown-styler
```

仓库有两个 remote：`origin` 指向本改造版，`upstream` 指向 `Moyf/paseo-markdown-styler`。拉取上游改动：

```bash
git fetch upstream
git merge upstream/main
```

`package-lock.json` 仍是上游的 lockfile；改动依赖后需用 `npm install` 重新生成。

插件是纯客户端的：`index.server.ts` 的作用是持久化设置并提供给客户端读取。CSS 注入仅在桌面端与浏览器客户端生效；`==高亮==` 语法依赖 Moyf 版 Paseo 构建的解析器支持，设置页会自动检测，不支持的客户端会隐藏高亮相关字段。

## 致谢

原插件与原始构想：[Moyf](https://github.com/Moyf) —— [Moyf/paseo-markdown-styler](https://github.com/Moyf/paseo-markdown-styler)。注入式实现架构、`.enrm-text` 作用域以及原版设置页设计均来自该项目。

## 许可

与上游一致，未附带 LICENSE 文件——原仓库同样没有。若打算再分发本改造版，请先向原作者确认授权条款。
