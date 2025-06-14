export interface Series {
  seriesInstanceUID: string;
  seriesNumber: number;
  modality: string;
  imageIds: string[];
  thumbnail?: string;
}

export interface ViewerProps {
  fileData?: {
    files: File[];
    uploadType: "single" | "multiple" | "series" | "study";
    seriesGroups: Map<string, File[]>;
  };
}

export interface ViewportMetadata {
  patientName?: string;
  patientID?: string;
  studyDate?: string;
  seriesDescription?: string;
  modality?: string;
  sliceLocation?: string;
  instanceNumber?: number;
  windowCenter?: string;
  windowWidth?: string;
}
