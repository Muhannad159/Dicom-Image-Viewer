import React from "react";
import type { Series } from "@/utilities/types";

interface SeriesSidebarProps {
  uploadType: "single" | "multiple" | "series" | "study";
  seriesList: Series[];
  selectedSeriesUID: string | null;
  onSeriesSelect: (seriesUID: string) => void;
}

export function SeriesSidebar({
  uploadType,
  seriesList,
  selectedSeriesUID,
  onSeriesSelect,
}: SeriesSidebarProps) {
  return (
    <div className="w-full md:w-60 lg:w-70 bg-white border-r border-gray-200 flex flex-col h-auto md:h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">
          {uploadType === "single"
            ? "File"
            : uploadType === "multiple"
            ? "Files"
            : uploadType === "series"
            ? "Series"
            : "Study"}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {seriesList.map((series) => (
          <div
            key={series.seriesInstanceUID}
            className={`p-3 border-b border-gray-100 cursor-pointer transition-colors ${
              selectedSeriesUID === series.seriesInstanceUID
                ? "bg-blue-50 border-l-4 border-l-blue-500"
                : "hover:bg-gray-50"
            }`}
            onClick={() => onSeriesSelect(series.seriesInstanceUID)}
          >
            <div className="flex items-start">
              {series.thumbnail ? (
                <div className="mr-3 flex-shrink-0">
                  <img
                    src={series.thumbnail}
                    alt="Series thumbnail"
                    className="h-28 w-32 rounded-sm object-cover border border-gray-200"
                  />
                </div>
              ) : (
                <div className="mr-3 flex-shrink-0 h-12 w-12 bg-gray-100 rounded-sm border border-gray-200 flex items-center justify-center text-gray-400 text-xs">
                  No Image
                </div>
              )}

              <div className="min-w-0 flex-1 mt-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {uploadType === "single" || uploadType === "multiple"
                      ? series.seriesInstanceUID
                      : `Series ${series.seriesNumber}`}
                  </p>
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                    {series.imageIds.length}
                  </span>
                </div>

                <span className="text-sm text-gray-500">{series.modality}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
