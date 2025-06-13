import React from "react";
import { Upload } from "lucide-react";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
}

function FileUpload({ onFilesSelected }: FileUploadProps) {
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.name.endsWith(".dcm")
    );
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.name.endsWith(".dcm")
    );
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  return (
    <div
      className="flex items-center justify-center h-full border-2 border-dashed border-gray-300"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => document.getElementById("file-input")?.click()}
    >
      <div className="text-center">
        <Upload size={48} className="text-gray-400 mx-auto" />
        <p>Drop DICOM files or click to browse</p>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".dcm"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    </div>
  );
}

export default FileUpload;
