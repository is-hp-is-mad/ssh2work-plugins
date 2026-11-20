import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdownReport, validatePluginTree } from './validate-plugins.mjs';

const OFFICIAL_CLAUDE = JSON.stringify({
  id: 'claude-code',
  name: 'Claude Code 助手',
  version: '1.1.0',
  author: 'ssh2work',
  description: 'Claude Code helper',
});

test('rejects duplicate plugin ID when a third-party adds a new plugin colliding with an existing ID', () => {
  const basePlugins = new Map([['plugins/ai-agents/claude-code/plugin.json', OFFICIAL_CLAUDE]]);
  const headPlugins = new Map([
    ['plugins/ai-agents/claude-code/plugin.json', OFFICIAL_CLAUDE],
    [
      'plugins/devops/claude-code/plugin.json',
      JSON.stringify({
        id: 'claude-code',
        name: 'Duplicate',
        version: '1.0.0',
        description: 'Collides with official claude-code',
      }),
    ],
  ]);

  const res = validatePluginTree({ basePlugins, headPlugins, isMaintainer: false });
  assert.equal(res.ok, false);
  const dupErr = res.errors.find((e) => e.type === 'duplicate_id');
  assert.ok(dupErr);
  assert.ok(dupErr.message.includes('plugins/ai-agents/claude-code/plugin.json'));
  assert.ok(dupErr.message.includes('claude-code'));

  const md = formatMarkdownReport(res, { prAuthor: 'someone' });
  assert.ok(md.includes('plugins/ai-agents/claude-code/plugin.json'));
});

test('allows third-party PR to update/fix an existing plugin without duplicate or community-suffix errors', () => {
  const basePlugins = new Map([['plugins/ai-agents/claude-code/plugin.json', OFFICIAL_CLAUDE]]);
  const updated = JSON.stringify({
    id: 'claude-code',
    name: 'Claude Code 助手',
    version: '1.1.1',
    author: 'ssh2work',
    description: 'Fixed typo in description',
  });
  const headPlugins = new Map([['plugins/ai-agents/claude-code/plugin.json', updated]]);

  const res = validatePluginTree({ basePlugins, headPlugins, isMaintainer: false });
  assert.equal(res.ok, true);
  assert.equal(res.updatedPlugins.length, 1);
  assert.equal(res.newPlugins.length, 0);
});

test('requires -community suffix for third-party new plugins, and passes when present', () => {
  const basePlugins = new Map([['plugins/ai-agents/claude-code/plugin.json', OFFICIAL_CLAUDE]]);

  // Missing -community suffix
  const badHead = new Map([
    ['plugins/ai-agents/claude-code/plugin.json', OFFICIAL_CLAUDE],
    [
      'plugins/devops/nginx-helper/plugin.json',
      JSON.stringify({
        id: 'nginx-helper',
        name: 'Nginx Helper',
        version: '1.0.0',
        description: 'Manage nginx',
      }),
    ],
  ]);
  const badRes = validatePluginTree({ basePlugins, headPlugins: badHead, isMaintainer: false });
  assert.equal(badRes.ok, false);
  assert.ok(badRes.errors.some((e) => e.type === 'missing_community_suffix'));

  // With -community suffix
  const goodHead = new Map([
    ['plugins/ai-agents/claude-code/plugin.json', OFFICIAL_CLAUDE],
    [
      'plugins/ai-agents/claude-code-community/plugin.json',
      JSON.stringify({
        id: 'claude-code-community',
        name: 'Claude Code 社区增强版',
        version: '1.0.0',
        description: 'Community edition',
      }),
    ],
  ]);
  const goodRes = validatePluginTree({ basePlugins, headPlugins: goodHead, isMaintainer: false });
  assert.equal(goodRes.ok, true);
  assert.equal(goodRes.newPlugins.length, 1);
  assert.equal(goodRes.newPlugins[0].id, 'claude-code-community');
});

test('allows maintainers/admins to add new official plugins without -community or graduate community plugins', () => {
  const communityJson = JSON.stringify({
    id: 'nginx-helper-community',
    name: 'Nginx Helper',
    version: '1.0.0',
    description: 'Manage nginx',
  });
  const officialJson = JSON.stringify({
    id: 'nginx-helper',
    name: 'Nginx Helper',
    version: '1.0.0',
    description: 'Manage nginx (graduated to official)',
  });

  // Maintainer promotes nginx-helper-community -> nginx-helper
  const basePlugins = new Map([['plugins/devops/nginx-helper-community/plugin.json', communityJson]]);
  const headPlugins = new Map([['plugins/devops/nginx-helper/plugin.json', officialJson]]);

  const res = validatePluginTree({ basePlugins, headPlugins, isMaintainer: true });
  assert.equal(res.ok, true);
  assert.equal(res.newPlugins[0].id, 'nginx-helper');
});
