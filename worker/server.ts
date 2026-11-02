import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { DESIGN_LOOP, imagePrompt, REVIEW_DESIGN, type RollerBrief } from '../src/mcp/prompts';

export type CallTab = (method: string, params?: unknown) => Promise<unknown>;

interface TabImage { name: string; dataUrl: string }

// reply() turns what the tab sent back into MCP content. Preview images become image blocks, and the rest goes as JSON.
function reply(result: unknown) {
  const { images, ...rest } = (result ?? {}) as { images?: TabImage[] };
  const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [
    { type: 'text', text: JSON.stringify(rest, null, 1) },
  ];
  for (const im of images ?? []) {
    content.push({ type: 'text', text: im.name });
    content.push({ type: 'image', data: im.dataUrl.slice(im.dataUrl.indexOf(',') + 1), mimeType: 'image/png' });
  }
  return { content };
}

const view = z.boolean().optional().describe('Return the flat preview with the result, so you can see the change.');
const patch = z.record(z.string(), z.unknown());

// buildServer() makes a fresh MCP server for one request. Every tool forwards to the tab, which applies the change
// through the app's own setters and answers after its rebuild, with the new summary and print check.
export function buildServer(callTab: CallTab, mintUploadUrl: () => Promise<string>): McpServer {
  const server = new McpServer({ name: 'pottery-roller', version: '0.1.0' });
  // The SDK's overloads can't infer through a generic helper, so the helper narrows registerTool to the one shape it uses.
  const register = server.registerTool.bind(server) as (name: string, config: { description: string; inputSchema: z.ZodObject }, cb: (a: never) => Promise<unknown>) => unknown;
  const tool = <S extends z.ZodObject>(name: string, description: string, inputSchema: S, run: (a: z.infer<S>) => Promise<unknown>) =>
    register(name, { description, inputSchema }, async (a: z.infer<S>) => {
      try { return reply(await run(a)); } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    });
  const apply = (ops: unknown[], v?: boolean) => callTab('apply', { ops, view: v ?? false });

  tool('get_state', 'Read the whole design: settings, layers (index 0 is the bottom), roller size, filament, print check and the fixes it offers.',
    z.object({}), () => callTab('getState'));
  tool('view', 'See the design. "flat" is the unrolled roller, and "3d" is the 3D view in the chosen mode.',
    z.object({ which: z.enum(['flat', '3d', 'both']).default('both'), mode: z.enum(['painted', 'roller', 'print']).optional().describe('painted shows the impression on the pot') }),
    (a) => callTab('view', a));
  tool('update_settings', 'Merge a patch into the settings, such as {"depth": 2} or {"build": {"kind": "solid"}}. Unknown keys and wrong types are rejected.',
    z.object({ patch, view }), (a) => apply([{ op: 'settings', patch: a.patch }], a.view));
  tool('add_lines', 'Add a lines layer on top.', z.object({ view }), (a) => apply([{ op: 'addLayer', kind: 'lines' }], a.view));
  tool('search_library', 'Search a design library. Pass a result\'s source and id to add_design.',
    z.object({ source: z.enum(['builtin', 'hero', 'patternmonster', 'iconify']), query: z.string().default('') }), (a) => callTab('searchLibrary', a));
  tool('add_design', 'Add a design from search_library as a new top layer.',
    z.object({ source: z.string(), id: z.string(), view }), (a) => apply([{ op: 'addDesign', source: a.source, id: a.id }], a.view));
  tool('add_image', 'Add an image from an https or data URL as a new top layer. For a file on this computer, use image_upload_url instead.',
    z.object({ url: z.string(), name: z.string().default('Image'), view }), (a) => apply([{ op: 'addImage', url: a.url, name: a.name }], a.view));
  tool('image_upload_url', 'Get a one-time link, valid for 5 minutes, for adding a local image file as a layer. Upload it with: curl -X POST --data-binary @FILE -H "Content-Type: image/png" "URL&name=FILE"',
    z.object({}), async () => ({ url: await mintUploadUrl() }));
  tool('update_layer', 'Merge a patch into one layer, such as {"size": 90} or {"lines": {"thickness": 2}}.',
    z.object({ id: z.string(), patch, view }), (a) => apply([{ op: 'updateLayer', id: a.id, patch: a.patch }], a.view));
  tool('remove_layer', 'Remove one layer.', z.object({ id: z.string(), view }), (a) => apply([{ op: 'removeLayer', id: a.id }], a.view));
  tool('move_layer', 'Move a layer to a new index. Index 0 is the bottom layer.',
    z.object({ id: z.string(), to: z.number().int(), view }), (a) => apply([{ op: 'moveLayer', id: a.id, to: a.to }], a.view));
  tool('apply_fix', 'Press one of the fix buttons the print check offers, as listed by get_state.',
    z.object({ key: z.enum(['fixLines', 'fixGaps']), value: z.string(), view }), (a) => apply([{ op: 'fix', key: a.key, value: a.value }], a.view));
  tool('batch', 'Apply several changes in one rebuild. Either all apply or none does. Each op is one of: {op:"settings",patch}, {op:"addLayer",kind:"lines"}, {op:"addDesign",source,id}, {op:"addImage",url,name}, {op:"updateLayer",id,patch}, {op:"removeLayer",id}, {op:"moveLayer",id,to}, {op:"fix",key,value}.',
    z.object({ ops: z.array(z.record(z.string(), z.unknown())).min(1), view }), (a) => apply(a.ops, a.view));
  tool('checkpoint', 'Save the current design under a name, with its preview, before you experiment.',
    z.object({ name: z.string() }), (a) => callTab('checkpoint', a));
  tool('restore', 'Put a saved checkpoint back.', z.object({ name: z.string(), view }), (a) => callTab('restore', a));
  tool('compare', 'Show two checkpoints\' previews side by side. Use "current" for the design as it is now.',
    z.object({ a: z.string(), b: z.string() }), (a) => callTab('compare', a));
  tool('export', 'Save a file through the tab\'s download, the same as its buttons: the STL, the flat PNG, or the plate as 3MF.',
    z.object({ format: z.enum(['stl', 'png', '3mf']) }), (a) => callTab('export', a));

  const say = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });
  server.registerPrompt('design_roller', { title: 'Design a roller', description: 'Work on the roller in the open tab in look, change and look-again rounds.',
    argsSchema: z.object({ idea: z.string().optional().describe('What the roller should look like') }) },
  ({ idea }) => say(`${DESIGN_LOOP}${idea ? `\n\nThe user's idea: ${idea}` : ''}`));
  server.registerPrompt('image_prompt', { title: 'Image prompt for this roller', description: 'Write an image-generator prompt sized to the roller in the open tab.',
    argsSchema: z.object({ subject: z.string().describe('What the image shows'), style: z.string().optional() }) },
  async ({ subject, style }) => say(`Give the user this prompt for their image generator, as it is:\n\n${imagePrompt((await callTab('brief')) as RollerBrief, subject, style)}`));
  server.registerPrompt('review_design', { title: 'Review the design', description: 'Judge the current roller and suggest the next change.' }, () => say(REVIEW_DESIGN));
  return server;
}
