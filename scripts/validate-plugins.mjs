import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const PLUGIN_PATH_RE = /^plugins\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\/plugin\.json$/;

/**
 * Validate plugin manifests in headPlugins against basePlugins.
 * Distinguishes new plugins from updates/fixes to existing plugins.
 */
export function validatePluginTree({ basePlugins = new Map(), headPlugins = new Map(), isMaintainer = false } = {}) {
  const errors = [];
  const newPlugins = [];
  const updatedPlugins = [];

  // Map id -> list of filePaths in headPlugins
  const idToPaths = new Map();
  const parsedHead = new Map();

  for (const [filePath, rawContent] of headPlugins.entries()) {
    const match = filePath.match(PLUGIN_PATH_RE);
    if (!match) {
      errors.push({
        type: 'invalid_path',
        filePath,
        message: `插件路径 "${filePath}" 不符合分类规范，必须为 "plugins/<分类>/<插件ID>/plugin.json"（仅允许小写字母、数字和连字符）。`,
      });
      continue;
    }

    const [, category, dirName] = match;
    let data;
    try {
      data = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    } catch (err) {
      errors.push({
        type: 'invalid_json',
        filePath,
        message: `插件清单 "${filePath}" 不是有效的 JSON: ${err.message}`,
      });
      continue;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push({
        type: 'invalid_schema',
        filePath,
        message: `插件清单 "${filePath}" 顶层必须是 JSON 对象。`,
      });
      continue;
    }

    const id = String(data.id || '').trim();
    if (!id) {
      errors.push({
        type: 'missing_id',
        filePath,
        message: `插件清单 "${filePath}" 缺少必填字段 "id"。`,
      });
      continue;
    }

    if (!ID_RE.test(id)) {
      errors.push({
        type: 'invalid_id',
        filePath,
        pluginId: id,
        message: `插件 ID "${id}" 格式不合法（仅允许小写字母、数字和连字符，且不能以连字符开头）。`,
      });
      continue;
    }

    if (id !== dirName) {
      errors.push({
        type: 'dir_mismatch',
        filePath,
        pluginId: id,
        message: `插件目录名 "${dirName}" 必须与 plugin.json 中的 "id" ("${id}") 完全一致。`,
      });
    }

    for (const reqField of ['name', 'version', 'description']) {
      if (!String(data[reqField] || '').trim()) {
        errors.push({
          type: 'missing_field',
          filePath,
          pluginId: id,
          message: `插件 "${id}" (${filePath}) 缺少必填字段 "${reqField}"。`,
        });
      }
    }

    if (data.quickCommands !== undefined) {
      if (!Array.isArray(data.quickCommands)) {
        errors.push({
          type: 'invalid_quick_commands',
          filePath,
          pluginId: id,
          message: `插件 "${id}" (${filePath}) 的 "quickCommands" 必须是数组。`,
        });
      } else {
        for (let i = 0; i < data.quickCommands.length; i++) {
          const qc = data.quickCommands[i];
          if (!qc || typeof qc !== 'object' || !String(qc.name || '').trim() || !String(qc.command || '').trim()) {
            errors.push({
              type: 'invalid_quick_commands',
              filePath,
              pluginId: id,
              message: `插件 "${id}" (${filePath}) 的 quickCommands[${i}] 必须包含非空的 "name" 和 "command"。`,
            });
          }
        }
      }
    }

    parsedHead.set(filePath, { id, category, dirName, data });
    if (!idToPaths.has(id)) idToPaths.set(id, []);
    idToPaths.get(id).push(filePath);
  }

  // Classify each valid plugin as "updated/fix" vs "new"
  for (const [filePath, info] of parsedHead.entries()) {
    const baseRaw = basePlugins.get(filePath);
    let baseId = null;
    if (baseRaw !== undefined) {
      try {
        const baseObj = typeof baseRaw === 'string' ? JSON.parse(baseRaw) : baseRaw;
        baseId = baseObj?.id ? String(baseObj.id).trim() : null;
      } catch {
        baseId = null;
      }
    }

    const isUpdateOrFix = basePlugins.has(filePath) && baseId === info.id;
    const allPathsWithId = idToPaths.get(info.id) || [];
    const otherPaths = allPathsWithId.filter((p) => p !== filePath);

    if (isUpdateOrFix) {
      updatedPlugins.push({ filePath, id: info.id, category: info.category });
      // Even for updates, if another duplicate exists in head, report it
      if (otherPaths.length > 0) {
        errors.push({
          type: 'duplicate_id',
          filePath,
          pluginId: info.id,
          duplicateWith: otherPaths,
          message: `插件 ID 重复: "${info.id}" 同时存在于 "${filePath}" 与 "${otherPaths.join('", "')}"，请检查插件 ID！`,
        });
      }
      continue;
    }

    // It is a NEW plugin (newly added file, or its ID was changed)
    newPlugins.push({ filePath, id: info.id, category: info.category });

    // 1. Check duplicate ID against existing plugins or other new plugins
    if (otherPaths.length > 0) {
      errors.push({
        type: 'duplicate_id',
        filePath,
        pluginId: info.id,
        duplicateWith: otherPaths,
        message: `新插件 ID 重复: "${info.id}"（${filePath}）与已有插件 "${otherPaths.join('", "')}" 的插件 ID ("${info.id}") 重复，请检查并修改插件 ID！`,
      });
    }

    // 2. Check -community suffix requirement for third-party contributors
    if (!isMaintainer && !info.id.endsWith('-community')) {
      errors.push({
        type: 'missing_community_suffix',
        filePath,
        pluginId: info.id,
        message: `第三方贡献的新插件 "${info.id}"（${filePath}）的插件 ID 后缀必须为 "-community"（例如 "${info.id}-community"）。社区管理员审核后可将其合并为官方插件或移除 "-community" 后缀。`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    isMaintainer,
    totalPlugins: parsedHead.size,
    newPlugins,
    updatedPlugins,
    errors,
  };
}

function readGitPlugins(ref) {
  const map = new Map();
  let listOut = '';
  try {
    listOut = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', 'plugins'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return map;
  }
  if (!listOut) return map;
  for (const filePath of listOut.split(/\r?\n/)) {
    if (!filePath.endsWith('/plugin.json') && filePath !== 'plugin.json') continue;
    const content = execFileSync('git', ['show', `${ref}:${filePath}`], { encoding: 'utf8' });
    map.set(filePath, content);
  }
  return map;
}

function readLocalPlugins(rootDir = process.cwd()) {
  const map = new Map();
  const pluginsRoot = path.join(rootDir, 'plugins');
  if (!fs.existsSync(pluginsRoot)) return map;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === 'plugin.json') {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        map.set(rel, fs.readFileSync(full, 'utf8'));
      }
    }
  }

  walk(pluginsRoot);
  return map;
}

export function formatMarkdownReport(result, { prAuthor = '' } = {}) {
  const lines = [];
  if (result.ok) {
    lines.push('### ✅ 插件校验通过 (`ssh4work-plugins`)');
    lines.push('');
    lines.push(`- **提交者身份**：${result.isMaintainer ? '🛡️ 仓库管理员 / 维护者' : '🤝 社区贡献者'}${prAuthor ? ` (@${prAuthor})` : ''}`);
    lines.push(`- **仓库插件总数**：${result.totalPlugins}`);
    if (result.newPlugins.length > 0) {
      lines.push(`- **新增插件**：${result.newPlugins.map((p) => `\`${p.id}\` (\`${p.filePath}\`)`).join('、')}`);
    }
    if (result.updatedPlugins.length > 0) {
      lines.push(`- **更新 / 修复已有插件**：${result.updatedPlugins.map((p) => `\`${p.id}\``).join('、')}`);
    }
    return lines.join('\n');
  }

  lines.push('### ❌ 插件校验未通过，请根据以下提示修改后重新推送');
  lines.push('');
  lines.push(`- **提交者身份**：${result.isMaintainer ? '🛡️ 仓库管理员 / 维护者' : '🤝 社区贡献者（新插件需带 `-community` 后缀）'}${prAuthor ? ` (@${prAuthor})` : ''}`);
  lines.push('');
  lines.push('#### 错误详情');
  for (const err of result.errors) {
    lines.push(`- **[\`${err.type}\`]** ${err.message}`);
  }
  lines.push('');
  lines.push('> **规则说明**：');
  lines.push('> 1. 所有插件必须按分类存放于 `plugins/<分类>/<插件ID>/plugin.json`，且目录名与 `id` 字段一致。');
  lines.push('> 2. 新增插件的 `id` 不得与仓库中已有插件重复；更新/修复（fix）已有插件不受影响。');
  lines.push('> 3. 第三方贡献者提交的**新插件**，其插件 ID 后缀必须为 `-community`（例如 `claude-code-community`）；社区管理员审核后可合并为官方版或移除 `-community` 后缀。');
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : '';
  };

  const baseRef = getArg('--base');
  const headRef = getArg('--head');
  const isMaintainer = getArg('--maintainer') === 'true';
  const jsonOut = getArg('--json-out');
  const prAuthor = getArg('--author');

  const basePlugins = baseRef ? readGitPlugins(baseRef) : new Map();
  const headPlugins = headRef ? readGitPlugins(headRef) : readLocalPlugins(process.cwd());

  const result = validatePluginTree({ basePlugins, headPlugins, isMaintainer });
  const summaryMarkdown = formatMarkdownReport(result, { prAuthor });
  const payload = { ...result, summaryMarkdown };

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2), 'utf8');
  }

  console.log(summaryMarkdown);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
