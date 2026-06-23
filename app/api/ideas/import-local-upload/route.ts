import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { importLocalProject } from "@/lib/import-local";
import { isValidIdeaType } from "@/lib/idea-types";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const ideaType = formData.get("ideaType") as string | null;

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
  }

  // Create a temporary directory to store the uploaded project
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rapid-vibe-"));
  const projectName = files[0].webkitRelativePath.split('/')[0];
  const projectPath = path.join(tempDir, projectName);
  await fs.mkdir(projectPath, { recursive: true });


  try {
    // Write the files to the temporary directory
    for (const file of files) {
      const filePath = path.join(tempDir, file.webkitRelativePath);
      const dirName = path.dirname(filePath);
      await fs.mkdir(dirName, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
    }

    const result = await importLocalProject(projectPath, isValidIdeaType(ideaType) ? ideaType as string : "web-app");

    // Clean up the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });

    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    // Clean up the temporary directory in case of an error
    await fs.rm(tempDir, { recursive: true, force: true });
    return NextResponse.json({ error: e?.message || "Import failed." }, { status: 500 });
  }
}
