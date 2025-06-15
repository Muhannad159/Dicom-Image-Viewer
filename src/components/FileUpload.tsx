import React, { useCallback, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Upload, File, Folder } from "lucide-react";

interface FileUploadProps {
  setFiles: (data: {
    files: File[];
    uploadType: "single" | "multiple" | "series" | "study";
    seriesGroups: Map<string, File[]>;
  }) => void;
}

function FileUpload({ setFiles }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);

  // Handle file uploads (single or multiple)
  const handleFileUpload = useCallback(
    (files: File[]) => {
      const filteredFiles = files.filter((file) =>
        file.name.toLowerCase().endsWith(".dcm")
      );
      if (filteredFiles.length === 0) {
        console.warn("No valid DICOM files selected.");
        return;
      }

      // Detect upload type
      let uploadType: "single" | "multiple";
      const seriesGroups = new Map<string, File[]>();

      if (filteredFiles.length === 1) {
        uploadType = "single";
        seriesGroups.set(filteredFiles[0].name, [filteredFiles[0]]);
      } else {
        uploadType = "multiple";
        filteredFiles.forEach((file, index) =>
          seriesGroups.set(`${file.name}_${index}`, [file])
        );
      }

      setFiles({ files: filteredFiles, uploadType, seriesGroups });
      console.log(
        `Upload type: ${uploadType}, Files:`,
        filteredFiles.map((f) => f.name),
        `SeriesGroups:`,
        Array.from(seriesGroups.entries()).map(([key, files]) => ({
          key,
          files: files.map((f) => f.name),
        }))
      );

      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [setFiles]
  );

  // Handle folder uploads (series or study)
  const handleFolderUpload = useCallback(
    (files: File[]) => {
      const filteredFiles = files.filter((file) =>
        file.name.toLowerCase().endsWith(".dcm")
      );
      if (filteredFiles.length === 0) {
        console.warn("No valid DICOM files selected.");
        return;
      }

      // Detect upload type
      let uploadType: "series" | "study";
      const seriesGroups = new Map<string, File[]>();
      const folders = new Set<string>();

      filteredFiles.forEach((file) => {
        const pathParts = file.webkitRelativePath
          ? file.webkitRelativePath.split("/")
          : [file.name];
        const parentFolder =
          pathParts.length > 1
            ? pathParts[pathParts.length - 2]
            : `Series_${seriesGroups.size + 1}`;
        folders.add(parentFolder);
        const groupKey = parentFolder;
        if (!seriesGroups.has(groupKey)) {
          seriesGroups.set(groupKey, []);
        }
        seriesGroups.get(groupKey)!.push(file);
      });

      uploadType =
        folders.size > 1 ||
        filteredFiles.some(
          (f) =>
            f.webkitRelativePath && f.webkitRelativePath.split("/").length > 2
        )
          ? "study"
          : "series";

      setFiles({ files: filteredFiles, uploadType, seriesGroups });

      // Reset input
      if (folderInputRef.current) folderInputRef.current.value = "";
    },
    [setFiles]
  );

  // File input change handler
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        handleFileUpload(Array.from(event.target.files));
      }
    },
    [handleFileUpload]
  );

  // Folder input change handler
  const handleFolderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        handleFolderUpload(Array.from(event.target.files));
      }
    },
    [handleFolderUpload]
  );

  // File button click
  const handleFileClick = () => {
    console.log("File button clicked, input ref:", fileInputRef.current); // Debug log
    fileInputRef.current?.click();
  };

  // Folder button click
  const handleFolderClick = () => {
    console.log("Folder button clicked, input ref:", folderInputRef.current); // Debug log
    folderInputRef.current?.click();
  };

  // File drag-and-drop handlers
  const handleFileDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFiles(true);
    },
    []
  );

  const handleFileDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFiles(true);
    },
    []
  );

  const handleFileDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFiles(false);
    },
    []
  );

  const handleFileDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFiles(false);
      console.log(
        "Files dropped (file card):",
        Array.from(event.dataTransfer.files).map((f) => f.name)
      ); // Debug log

      const files = event.dataTransfer.files;
      if (files.length > 0) {
        handleFileUpload(Array.from(files));
      }
    },
    [handleFileUpload]
  );

  // Folder drag-and-drop handlers
  const handleFolderDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFolder(true);
      console.log("Folder drag over"); // Debug log
    },
    []
  );

  const handleFolderDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFolder(true);
      console.log("Folder drag enter"); // Debug log
    },
    []
  );

  const handleFolderDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFolder(false);
    },
    []
  );

  const handleFolderDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFolder(false);

      const items = event.dataTransfer.items;
      const files: File[] = [];

      const readEntries = async (
        entry: FileSystemDirectoryEntry,
        path: string = ""
      ): Promise<File[]> => {
        const reader = entry.createReader();
        return new Promise((resolve) => {
          reader.readEntries(async (entries) => {
            const collectedFiles: File[] = [];
            for (const e of entries) {
              if (e.isFile) {
                const fileEntry = e as FileSystemFileEntry;
                const file = await new Promise<File>((res) =>
                  fileEntry.file((f) => res(f))
                );

                Object.defineProperty(file, "webkitRelativePath", {
                  value: `${path}${entry.name}/${file.name}`,
                  writable: true,
                });
                collectedFiles.push(file);
              } else if (e.isDirectory) {
                const dirEntry = e as FileSystemDirectoryEntry;
                const subFiles = await readEntries(
                  dirEntry,
                  `${path}${entry.name}/`
                );
                collectedFiles.push(...subFiles);
              }
            }
            resolve(collectedFiles);
          });
        });
      };

      // Process dropped items
      for (const item of items) {
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isFile) {
              const fileEntry = entry as FileSystemFileEntry;
              const file = await new Promise<File>((resolve) =>
                fileEntry.file(resolve)
              );
              files.push(file);
            } else if (entry.isDirectory) {
              const dirEntry = entry as FileSystemDirectoryEntry;
              const dirFiles = await readEntries(dirEntry);
              files.push(...dirFiles);
            }
          }
        }
      }

      if (files.length > 0) {
        handleFolderUpload(files);
      } else {
        console.warn("No files collected from folder drop.");
      }
    },
    [handleFolderUpload]
  );

  return (
    <div className="h-screen w-full bg-gray-50 flex flex-col items-center justify-center">
      <div className=" flex flex-col items-center justify-center p-8 space-y-8 ">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">DICOM Viewer</h1>
          <p className="text-gray-600">
            Upload DICOM files or folders to visualize medical imaging data
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File Upload Card */}
          <div
            className={`border-2 rounded-xl p-6 transition-all ${
              isDraggingFiles
                ? "border-emerald-500 bg-emerald-50"
                : "border-gray-200 bg-white"
            } shadow-sm hover:shadow-md`}
            onDragOver={handleFileDragOver}
            onDragEnter={handleFileDragEnter}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
          >
            <div className="flex flex-col items-center text-center gap-4 h-full">
              <div className="p-3 rounded-full bg-emerald-100 text-emerald-600">
                <File className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">DICOM Files</h2>
                <p className="text-sm text-gray-500">
                  Upload individual DICOM files (.dcm)
                </p>
              </div>
              <Button
                onClick={handleFileClick}
                className="gap-2 mt-4"
                variant="outline"
              >
                <Upload className="w-4 h-4" />
                Select Files
              </Button>
              <p className="text-xs text-gray-400 mt-2">or drag files here</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                multiple
                accept=".dcm"
              />
            </div>
          </div>

          {/* Folder Upload Card */}
          <div
            className={`border-2 rounded-xl p-6 transition-all ${
              isDraggingFolder
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white"
            } shadow-sm hover:shadow-md`}
            onDragOver={handleFolderDragOver}
            onDragEnter={handleFolderDragEnter}
            onDragLeave={handleFolderDragLeave}
            onDrop={handleFolderDrop}
          >
            <div className="flex flex-col items-center text-center gap-4 h-full">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                <Folder className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">DICOM Folders</h2>
                <p className="text-sm text-gray-500">
                  Upload study or series folders containing DICOM files
                </p>
              </div>
              <Button
                onClick={handleFolderClick}
                className="gap-2 mt-4"
                variant="outline"
              >
                <Upload className="w-4 h-4" />
                Select Folder
              </Button>
              <p className="text-xs text-gray-400 mt-2">or drag folder here</p>
              <input
                type="file"
                ref={folderInputRef}
                onChange={handleFolderChange}
                className="hidden"
                webkitdirectory=""
                accept=".dcm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FileUpload;
