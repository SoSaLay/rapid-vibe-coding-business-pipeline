/** Render every agent file from the approved design + model-written logic (+ the RAG index when on). */

import { frameworkAdapter } from "./registry";
import { exampleTasks } from "../phases/agent-engineering";
import { buildIndex } from "./knowledge";
import type { AgentDesign } from "./design";
import type { FilledLogic, GeneratedFile } from "./types";

export async function renderAgent(args: { projectId: string; title: string; design: AgentDesign; spec: Record<string, any>; logic: FilledLogic }) {
  const files: GeneratedFile[] = (await frameworkAdapter(args.projectId)).render({
    title: args.title,
    design: args.design,
    logic: args.logic,
    exampleTasks: exampleTasks(args.spec),
    spec: args.spec,
  });
  let knowledge: { chunks: number; problems: string[] } | undefined;
  if (args.design.knowledge?.mode === "rag") {
    const idx = await buildIndex(args.projectId, args.design.knowledge.sources);
    files.push({ path: "knowledge/index.json", content: idx.content, explains: `Your documents, split into ${idx.chunks} searchable passages.` });
    knowledge = { chunks: idx.chunks, problems: idx.problems };
  }
  return { files, knowledge };
}
