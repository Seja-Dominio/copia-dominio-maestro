import { readFile, writeFile } from "node:fs/promises";

const devProjectGuard = 'const isCxmDevelopmentProject = Deno.env.get("SUPABASE_URL") === "https://tqmfuskvllpqmvayjuqu.supabase.co";';
const devOriginsAnchor = "...(isCxmDevelopmentProject ? [\n";
const maestroPreviewOrigins = [
  '    "http://127.0.0.1:4176",\n',
  '    "http://localhost:4176",\n',
].join("");

export function patchMaestroDataDevCors(source) {
  if (!source.includes(devProjectGuard) || !source.includes("const allowedOrigins = new Set([")) {
    throw new Error("Fonte remoto de maestro-data não corresponde ao baseline Dev esperado; nenhuma alteração aplicada.");
  }

  const originCount = maestroPreviewOrigins
    .split("\n")
    .filter(Boolean)
    .map((line) => source.includes(line));
  if (originCount.every(Boolean)) return source;
  if (originCount.some(Boolean)) throw new Error("Allowlist de preview parcialmente aplicada; interrompendo para revisão manual.");

  const anchorCount = source.split(devOriginsAnchor).length - 1;
  if (anchorCount !== 1) throw new Error(`Esperada uma âncora de origens Dev, encontrada: ${anchorCount}.`);

  return source.replace(devOriginsAnchor, `${devOriginsAnchor}${maestroPreviewOrigins}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , sourcePath, outputPath] = process.argv;
  if (!sourcePath || !outputPath) {
    throw new Error("Uso: node scripts/patch-maestro-data-dev-cors.mjs <fonte-remota> <candidata>");
  }
  const source = await readFile(sourcePath, "utf8");
  await writeFile(outputPath, patchMaestroDataDevCors(source), "utf8");
}
