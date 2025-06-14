import React from "react";

interface ViewportOverlayProps {
  metadata: {
    patientName?: string;
    patientID?: string;
    studyDate?: string;
    seriesDescription?: string;
    modality?: string;
    sliceLocation?: string;
    instanceNumber?: number;
    windowCenter?: string;
    windowWidth?: string;
  };
  currentIndex: number;
  seriesCount: number;
}

export function ViewportOverlay({
  metadata,
  currentIndex,
  seriesCount,
}: ViewportOverlayProps) {
  if (!metadata) return null;

  return (
    <>
      <div className="absolute top-2 left-2 text-sky-500 text-sm bg-black bg-opacity-60 p-1.5 rounded">
        <div className="font-medium">
          Patient: {metadata.patientName || "N/A"}
        </div>
        <div>ID: {metadata.patientID || "N/A"}</div>
      </div>
      <div className="absolute top-2 right-2 text-sky-500 text-sm bg-black bg-opacity-60 p-1.5 rounded">
        <div className="font-medium">Date: {metadata.studyDate || "N/A"}</div>
        <div>Series: {metadata.seriesDescription || "N/A"}</div>
      </div>
      <div className="absolute bottom-2 left-2 text-sky-500 text-sm bg-black bg-opacity-60 p-1.5 rounded">
        <div className="font-medium">
          Modality: {metadata.modality || "N/A"}
        </div>
        <div>Location: {metadata.sliceLocation || "N/A"}</div>
      </div>
      <div className="absolute bottom-2 right-2 text-sky-500 text-sm bg-black bg-opacity-60 p-1.5 rounded">
        <div className="font-medium">
          Slice: {metadata.instanceNumber || "N/A"} / {seriesCount}
        </div>
        <div>
          WC/WW: {metadata.windowCenter || "N/A"}/
          {metadata.windowWidth || "N/A"}
        </div>
      </div>
    </>
  );
}
