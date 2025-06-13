import React, { useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Upload } from "lucide-react";

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

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>, isFolder: boolean) => {
      if (!event.target.files || event.target.files.length === 0) return;

      const files = Array.from(event.target.files).filter((file) =>
        file.name.toLowerCase().endsWith(".dcm")
      );
      if (files.length === 0) {
        console.warn("No valid DICOM files selected.");
        return;
      }

      // Detect upload type
      let uploadType: "single" | "multiple" | "series" | "study";
      const seriesGroups = new Map<string, File[]>();

      if (isFolder) {
        // Group files by parent folder (series)
        const folders = new Set<string>();
        files.forEach((file) => {
          const pathParts = file.webkitRelativePath.split("/");
          const parentFolder =
            pathParts.length > 1 ? pathParts[pathParts.length - 2] : "Series";
          folders.add(parentFolder);
          const groupKey = parentFolder;
          if (!seriesGroups.has(groupKey)) {
            seriesGroups.set(groupKey, []);
          }
          seriesGroups.get(groupKey)!.push(file);
        });

        uploadType =
          folders.size > 1 ||
          files.some((f) => f.webkitRelativePath.includes("/"))
            ? "study"
            : "series";
      } else {
        // Single or multiple files
        if (files.length === 1) {
          uploadType = "single";
          seriesGroups.set(files[0].name, [files[0]]);
        } else {
          uploadType = "multiple";
          files.forEach((file) => seriesGroups.set(file.name, [file]));
        }
      }

      setFiles({ files, uploadType, seriesGroups });
      console.log(
        `Upload type: ${uploadType}, Files:`,
        files.map((f) => f.name)
      );
    },
    [setFiles]
  );

  const handleFileClick = () => fileInputRef.current?.click();
  const handleFolderClick = () => folderInputRef.current?.click();

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">DICOM Viewer</h1>
      <div className="flex gap-2">
        <Button onClick={handleFileClick} className="flex items-center gap-2">
          <Upload size={20} />
          Upload File(s)
        </Button>
        <Button onClick={handleFolderClick} className="flex items-center gap-2">
          <Upload size={20} />
          Upload Folder
        </Button>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileChange(e, false)}
        className="hidden"
        multiple
        accept=".dcm"
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={(e) => handleFileChange(e, true)}
        className="hidden"
        webkitdirectory=""
        accept=".dcm"
      />
    </div>
  );
}

export default FileUpload;
