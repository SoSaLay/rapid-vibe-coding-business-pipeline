"use client";

import { useState, useRef, useCallback } from "react";

interface FolderUploadProps {
  onFolderSelect: (files: FileList) => void;
}

export function FolderUpload({ onFolderSelect }: FolderUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList) => {
    if (files && files.length > 0) {
      onFolderSelect(files);
      // Extract folder name from the relative path of the first file
      const firstFile = files[0];
      if (firstFile.webkitRelativePath) {
        setFolderName(firstFile.webkitRelativePath.split("/")[0]);
      } else {
        setFolderName("Selected folder");
      }
      setFileCount(files.length);
    }
  }, [onFolderSelect]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        isDragging ? "border-accent2 bg-accent2/10" : "border-edge hover:border-accent2/70"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        // @ts-ignore
        webkitdirectory="true"
        mozdirectory="true"
        directory="true"
      />
      {folderName ? (
        <div>
          <p className="text-lg font-medium text-fg">📁 {folderName}</p>
          <p className="text-sm text-muted">{fileCount} files selected</p>
          <p className="mt-4 text-xs text-accent2">Click or drop another folder to change</p>
        </div>
      ) : (
        <div>
          <p className="text-base font-medium text-fg">Drag & drop a project folder here</p>
          <p className="mt-1 text-sm text-muted">or</p>
          <button type="button" className="btn-secondary mt-2">
            Click to select a folder
          </button>
        </div>
      )}
    </div>
  );
}
