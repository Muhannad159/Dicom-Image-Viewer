import React, { useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Upload } from "lucide-react";

interface FileUploadProps {
  setFiles: (files: File[]) => void;
}

function FileUpload({ setFiles }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        const files = Array.from(event.target.files).filter((file) =>
          file.name.toLowerCase().endsWith(".dcm")
        );
        setFiles(files);
        console.log(
          "Selected files:",
          files.map((f) => f.name)
        );
      }
    },
    [setFiles]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">DICOM Viewer</h1>
      <Button onClick={handleClick} className="flex items-center gap-2">
        <Upload size={20} />
        Upload Study Folder
      </Button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        webkitdirectory=""
        multiple
        accept=".dcm"
      />
    </div>
  );
}

export default FileUpload;
