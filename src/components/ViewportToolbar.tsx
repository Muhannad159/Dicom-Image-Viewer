import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Hand,
  Sliders,
  Ruler,
  Pen,
  Maximize,
  Minimize,
  Square,
  Circle,
  RotateCw,
  Download,
} from "lucide-react";
import { Button } from "./ui/button";

interface ViewportToolbarProps {
  activeTool: string;
  zoomLevel: number;
  currentIndex: number;
  seriesCount: number;
  isViewportReady: boolean;
  selectedSeriesUID: string | null;
  onToolChange: (toolName: string) => void;
  onIndexChange: (index: number) => void;
  onFitToWindow: () => void;
  onActualSize: () => void;
  onExportImage: () => void;
}

export function ViewportToolbar({
  activeTool,
  zoomLevel,
  currentIndex,
  seriesCount,
  isViewportReady,
  selectedSeriesUID,
  onToolChange,
  onIndexChange,
  onFitToWindow,
  onActualSize,
  onExportImage,
}: ViewportToolbarProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center overflow-x-auto">
      <div className="flex space-x-5">
        {/* Navigation controls */}
        {selectedSeriesUID && seriesCount > 1 && (
          <div className="flex items-center mr-2 border-r space-x-3 border-gray-200 pr-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-12 p-0"
              onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="mx-1 text-sm text-gray-600 whitespace-nowrap">
              {currentIndex + 1} / {seriesCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() =>
                onIndexChange(Math.min(seriesCount - 1, currentIndex + 1))
              }
              disabled={currentIndex === seriesCount - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* View tools */}
        <div className="flex space-x-4">
          <Button
            variant={activeTool === "Zoom" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("Zoom")}
            title="Zoom"
          >
            <ZoomIn className="h-6 w-6" />
          </Button>
          <Button
            variant={activeTool === "Pan" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("Pan")}
            title="Pan"
          >
            <Hand className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "WindowLevel" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("WindowLevel")}
            title="Window Level/Width"
          >
            <Sliders className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-l border-gray-200 mx-1 h-6"></div>

        {/* Measurement tools */}
        <div className="flex space-x-1">
          <Button
            variant={activeTool === "Length" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("Length")}
            title="Measure Length"
          >
            <Ruler className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "Angle" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("Angle")}
            title="Measure Angle"
          >
            <Ruler className="h-4 w-4 transform rotate-45" />
          </Button>
        </div>

        <div className="border-l border-gray-200 mx-1 h-6"></div>

        {/* Annotation tools */}
        <div className="flex space-x-1">
          <Button
            variant={activeTool === "ArrowAnnotate" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("ArrowAnnotate")}
            title="Arrow Annotate"
          >
            <Pen className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "CircleROI" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("CircleROI")}
            title="Circle Annotation"
          >
            <Circle className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTool === "RectangleROI" ? "default" : "ghost"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("RectangleROI")}
            title="Rectangle Annotation"
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-l border-gray-200 mx-1 h-6"></div>

        {/* View controls */}
        <div className="flex space-x-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onFitToWindow}
            title="Fit to Window"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onActualSize}
            title="Actual Size"
          >
            <Minimize className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onToolChange("PlanarRotate")}
            title="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-l border-gray-200 mx-1 h-6"></div>

        {/* Export */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onExportImage}
          title="Export Image"
          disabled={!isViewportReady || !selectedSeriesUID}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <div className="ml-auto flex items-center">
        <span className="text-sm text-gray-600 mr-2">Zoom: {zoomLevel}%</span>
      </div>
    </div>
  );
}
