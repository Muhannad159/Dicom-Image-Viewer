import { useEffect, useRef, useState, useCallback } from "react";
import {
  RenderingEngine,
  Enums,
  metaData,
  imageLoader,
  init as coreInit,
} from "@cornerstonejs/core";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";
import {
  init as cornerstoneToolsInit,
  ToolGroupManager,
  ZoomTool,
  WindowLevelTool,
  PanTool,
  LengthTool,
  ArrowAnnotateTool,
  AngleTool,
  CircleROITool,
  EllipticalROITool,
  RectangleROITool,
  PlanarRotateTool,
  addTool,
  Enums as ToolsEnums,
} from "@cornerstonejs/tools";
import dicomParser from "dicom-parser";
import { Button } from "./ui/button";
import { useNavigate } from "react-router-dom";
import { ViewportOverlay } from "./ViewportOverlay";
import { ViewportToolbar } from "./ViewportToolbar";
import { SeriesSidebar } from "./SeriesSidebar";
import type { Series, ViewerProps } from "@/utilities/types";

function Viewer({ fileData }: ViewerProps) {
  const navigate = useNavigate();

  if (!fileData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 p-4">
        <h3 className="text-lg font-medium mb-2">No Files Uploaded</h3>
        <p className="text-sm">
          Please upload DICOM files or a folder to view.
        </p>
      </div>
    );
  }

  const { files, uploadType, seriesGroups } = fileData;
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [selectedSeriesUID, setSelectedSeriesUID] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [activeTool, setActiveTool] = useState<string>(
    WindowLevelTool.toolName
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isWadoInitialized, setIsWadoInitialized] = useState<boolean>(false);
  const [isViewportReady, setIsViewportReady] = useState<boolean>(false);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const toolGroupRef = useRef<any>(null);
  const lastScrollTime = useRef<number>(0);
  const viewportId = "CT_STACK";
  const renderingEngineId = "myRenderingEngine";
  const toolGroupId = "myToolGroup";
  const isViewportEnabled = useRef<boolean>(false);
  const isCoreInitialized = useRef<boolean>(false);
  const metadataMapRef = useRef<Map<string, any>>(new Map());
  const VIEWPORT_SCALE = 0.9;

  const TOOLS = [
    ZoomTool,
    WindowLevelTool,
    PanTool,
    LengthTool,
    ArrowAnnotateTool,
    AngleTool,
    CircleROITool,
    EllipticalROITool,
    RectangleROITool,
    PlanarRotateTool,
  ];

  // Initialize Cornerstone
  useEffect(() => {
    const initializeCore = async () => {
      if (!isCoreInitialized.current) {
        try {
          await coreInit();
          await dicomImageLoaderInit();
          await cornerstoneToolsInit();
          isCoreInitialized.current = true;
          setIsWadoInitialized(true);
          console.log("Cornerstone initialized");
        } catch (err) {
          setError(
            `Initialization failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    };
    initializeCore();
  }, []);

  // Register tools
  useEffect(() => {
    TOOLS.forEach(addTool);
  }, []);

  // Generate thumbnail
  const generateThumbnail = async (imageId: string, series: Series) => {
    try {
      const image = await imageLoader.loadAndCacheImage(imageId);
      const pixelData = image.getPixelData();
      if (!pixelData) {
        console.warn(`No pixel data for thumbnail: ${imageId}`);
        return;
      }
      const { rows, columns, photometricInterpretation } =
        metadataMapRef.current.get(imageId).imagePixelModule;

      // Normalize pixel data for better contrast
      let min = pixelData[0],
        max = pixelData[0];
      for (let i = 0; i < pixelData.length; i++) {
        min = Math.min(min, pixelData[i]);
        max = Math.max(max, pixelData[i]);
      }
      const range = max - min || 1;

      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d")!;
      const imgData = ctx.createImageData(100, 100);
      const scaleX = columns / 100;
      const scaleY = rows / 100;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const srcX = Math.floor(x * scaleX);
          const srcY = Math.floor(y * scaleY);
          const srcIdx =
            (srcY * columns + srcX) *
            (photometricInterpretation.includes("MONOCHROME") ? 1 : 3);
          const dstIdx = (y * 100 + x) * 4;
          if (photometricInterpretation.includes("MONOCHROME")) {
            const value = ((pixelData[srcIdx] - min) / range) * 255;
            imgData.data[dstIdx] =
              imgData.data[dstIdx + 1] =
              imgData.data[dstIdx + 2] =
                value;
            imgData.data[dstIdx + 3] = 255;
          } else {
            imgData.data[dstIdx] = ((pixelData[srcIdx] - min) / range) * 255;
            imgData.data[dstIdx + 1] =
              ((pixelData[srcIdx + 1] - min) / range) * 255;
            imgData.data[dstIdx + 2] =
              ((pixelData[srcIdx + 2] - min) / range) * 255;
            imgData.data[dstIdx + 3] = 255;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      series.thumbnail = canvas.toDataURL();
    } catch (err) {
      console.error(`Failed to generate thumbnail for ${imageId}:`, err);
    }
  };

  // Process files
  useEffect(() => {
    const processFiles = async () => {
      const seriesMap = new Map<string, Series>();
      const errors: string[] = [];

      for (const [groupKey, groupFiles] of seriesGroups) {
        const seriesInstanceUID = groupKey;
        let series: Series = seriesMap.get(seriesInstanceUID) || {
          seriesInstanceUID,
          seriesNumber: seriesMap.size + 1,
          modality: "OT",
          imageIds: [],
        };

        for (const file of groupFiles) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const byteArray = new Uint8Array(arrayBuffer);
            const dataset = dicomParser.parseDicom(byteArray);
            const transferSyntax =
              dataset.string("x00020010") || "1.2.840.10008.1.2.1";
            const imageId = `wadouri:${URL.createObjectURL(file)}`;
            const modality = dataset.string("x00080060") || "OT";
            series.modality = modality;
            metadataMapRef.current.set(imageId, {
              seriesInstanceUID,
              seriesNumber: series.seriesNumber,
              modality,
              transferSyntax,
              patientID: dataset.string("x00100020") || "Unknown",
              patientName: dataset.string("x00100010") || "Unknown",
              studyDate: dataset.string("x00080020") || "Unknown",
              seriesDescription: dataset.string("x0008103E") || "Unknown",
              sliceLocation: dataset.string("x00201041") || "Unknown",
              instanceNumber: dataset.intString("x00200013") || 0,
              windowCenter: dataset.string("x00281050"),
              windowWidth: dataset.string("x00281051"),
              imagePixelModule: {
                rows: dataset.uint16("x00280010") || 512,
                columns: dataset.uint16("x00280011") || 512,
                photometricInterpretation:
                  dataset.string("x00280004") || "MONOCHROME2",
                bitsAllocated: dataset.uint16("x00280100") || 16,
                bitsStored: dataset.uint16("x00280101") || 16,
                pixelRepresentation: dataset.uint16("x00280103") || 0,
              },
            });

            series.imageIds.push(imageId);

            if (
              (uploadType === "single" && series.imageIds.length === 1) ||
              (uploadType === "multiple" && series.imageIds.length === 1) ||
              (uploadType === "series" && series.imageIds.length === 1) ||
              (uploadType === "study" && series.imageIds.length === 1)
            ) {
              await generateThumbnail(imageId, series);
              setSelectedSeriesUID(seriesInstanceUID[0]);
              setCurrentIndex(0);
            }
          } catch (err) {
            errors.push(
              `Failed to process ${file.name}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }

        if (series.imageIds.length > 0) {
          seriesMap.set(seriesInstanceUID, series);
        }
      }

      metaData.addProvider((type, id) => {
        const data = metadataMapRef.current.get(id);
        return data ? data[type] || undefined : undefined;
      }, 100);

      const sortedSeries = Array.from(seriesMap.values()).sort(
        (a, b) => a.seriesNumber - b.seriesNumber
      );
      setSeriesList(sortedSeries);
      if (sortedSeries.length > 0 && !selectedSeriesUID) {
        setSelectedSeriesUID(sortedSeries[0].seriesInstanceUID);
        setCurrentIndex(0);
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
          console.log(
            "Initial series selected:",
            sortedSeries[0].seriesInstanceUID,
            { isViewportReady }
          );
        }, 100);
      }
      setError(
        errors.length > 0
          ? errors.join("\n")
          : sortedSeries.length === 0
          ? "No valid DICOM series loaded."
          : null
      );

      return () => {
        seriesList.forEach((series) =>
          series.imageIds.forEach((id) =>
            URL.revokeObjectURL(id.replace("wadouri:", ""))
          )
        );
        metaData.removeProvider(() => true);
        metadataMapRef.current.clear();
      };
    };

    processFiles();
  }, [files, uploadType, seriesGroups]);

  // Setup and resize viewport
  useEffect(() => {
    if (!viewportRef.current || !containerRef.current || !isWadoInitialized) {
      setIsViewportReady(false);
      return;
    }

    const element = viewportRef.current;
    const container = containerRef.current;
    let renderingEngine = renderingEngineRef.current;

    const setupViewport = async () => {
      if (!renderingEngine) {
        renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;
        console.log("RenderingEngine created");
      }

      if (!isViewportEnabled.current) {
        renderingEngine.enableElement({
          viewportId,
          element,
          type: Enums.ViewportType.STACK,
        });
        isViewportEnabled.current = true;
        console.log("Viewport enabled");

        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
          TOOLS.forEach((tool) => toolGroup.addTool(tool.toolName));
          toolGroup.setToolActive(activeTool, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });
          toolGroup.addViewport(viewportId, renderingEngineId);
          toolGroupRef.current = toolGroup;
          console.log("ToolGroup created");
        }
      }
      // Set ready earlier to trigger initial render
      setIsViewportReady(true);
    };

    const updateSize = () => {
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      const imageId = selectedSeries?.imageIds[currentIndex];
      const imageMetadata = imageId
        ? metadataMapRef.current.get(imageId)
        : undefined;

      if (imageMetadata && selectedSeries && imageId) {
        const { rows, columns } = imageMetadata.imagePixelModule;
        const aspectRatio = columns / rows;
        const containerAspect = container.clientWidth / container.clientHeight;

        let width = container.clientWidth * VIEWPORT_SCALE;
        let height = width / aspectRatio;
        if (aspectRatio < containerAspect) {
          height = container.clientHeight * VIEWPORT_SCALE;
          width = height * aspectRatio;
        }

        element.style.width = `${width}px`;
        element.style.height = `${height}px`;

        if (renderingEngine) {
          const viewport = renderingEngine.getViewport(
            viewportId
          ) as cornerstone.Types.IStackViewport;
          if (viewport) {
            const canvas = viewport.getCanvas();
            canvas.width = element.clientWidth;
            canvas.height = element.clientHeight;
            canvas.style.width = `${element.clientWidth}px`;
            canvas.style.height = `${element.clientHeight}px`;
            renderingEngine.resize();
            viewport.render();
            setZoomLevel(Math.round(viewport.getZoom() * 100));
            console.log("Viewport resized:", { width, height });
          }
        }
      } else {
        setIsViewportReady(false);
        console.log("Viewport not ready: missing metadata or series");
      }
    };

    setupViewport();
    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      ToolGroupManager.destroyToolGroup(toolGroupId);
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
        isViewportEnabled.current = false;
      }
    };
  }, [
    isWadoInitialized,
    seriesList,
    selectedSeriesUID,
    currentIndex,
    activeTool,
  ]);

  // Update stack
  useEffect(() => {
    if (
      !renderingEngineRef.current ||
      !viewportRef.current ||
      !selectedSeriesUID ||
      !isViewportReady
    ) {
      console.log("Skipping stack update:", {
        hasRenderingEngine: !!renderingEngineRef.current,
        hasViewport: !!viewportRef.current,
        selectedSeriesUID,
        isViewportReady,
      });
      return;
    }

    const selectedSeries = seriesList.find(
      (s) => s.seriesInstanceUID === selectedSeriesUID
    );
    if (!selectedSeries || selectedSeries.imageIds.length === 0) {
      setError("Selected series is invalid or has no images.");
      return;
    }

    const updateStack = async () => {
      try {
        const viewport = renderingEngineRef.current.getViewport(
          viewportId
        ) as cornerstone.Types.IStackViewport;
        let imageId = selectedSeries.imageIds[currentIndex];
        let image;
        let pixelData;
        let attempts = 0;
        const maxAttempts = selectedSeries.imageIds.length + 1;
        while (attempts < maxAttempts) {
          try {
            image = await imageLoader.loadAndCacheImage(imageId);
            pixelData = image.getPixelData();
            if (!pixelData) {
              throw new Error(`No pixel data available for ${imageId}`);
            }
            break; // Success, exit loop
          } catch (err) {
            console.warn(`Skipping image ${imageId}:`, err);
            attempts++;
            const nextIndex =
              (currentIndex + attempts) % selectedSeries.imageIds.length;
            imageId = selectedSeries.imageIds[nextIndex];
            if (attempts === maxAttempts) {
              throw new Error("No valid images found in series");
            }
          }
        }

        console.log(`Rendering image: ${imageId}`, {
          transferSyntax: metadataMapRef.current.get(imageId)?.transferSyntax,
          photometricInterpretation:
            metadataMapRef.current.get(imageId)?.imagePixelModule
              ?.photometricInterpretation,
          bitsAllocated:
            metadataMapRef.current.get(imageId)?.imagePixelModule
              ?.bitsAllocated,
          bitsStored:
            metadataMapRef.current.get(imageId)?.imagePixelModule?.bitsStored,
          pixelDataLength: pixelData?.length,
        });

        const imageMetadata = {
          patientID: metaData.get("patientID", imageId) || "Unknown",
          patientName: metaData.get("patientName", imageId) || "Unknown",
          studyDate: metaData.get("studyDate", imageId) || "Unknown",
          seriesDescription:
            metaData.get("seriesDescription", imageId) || "Unknown",
          sliceLocation: metaData.get("sliceLocation", imageId) || "Unknown",
          instanceNumber: metaData.get("instanceNumber", imageId) || 0,
          modality: metaData.get("modality", imageId) || "OT",
          windowCenter: metaData.get("windowCenter", imageId),
          windowWidth: metaData.get("windowWidth", imageId),
          pixelModule: metaData.get("imagePixelModule", imageId) || {},
        };
        setMetadata(imageMetadata);

        await viewport.setStack(selectedSeries.imageIds, currentIndex);

        const canvas = viewport.getCanvas();
        canvas.width = viewportRef.current.clientWidth;
        canvas.height = viewportRef.current.clientHeight;
        canvas.style.width = `${viewportRef.current.clientWidth}px`;
        canvas.style.height = `${viewportRef.current.clientHeight}px`;

        let windowCenter = parseFloat(imageMetadata.windowCenter);
        let windowWidth = parseFloat(imageMetadata.windowWidth);
        if (isNaN(windowCenter) || isNaN(windowWidth)) {
          windowCenter = 128;
          windowWidth = 256;
        }

        viewport.setProperties({
          voiRange: {
            lower: windowCenter - windowWidth / 2,
            upper: windowCenter + windowWidth / 2,
          },
        });

        viewport.reset();
        setZoomLevel(Math.round(viewport.getZoom() * 100));
        viewport.render();
        console.log(`Stack updated: ${imageId}`);
      } catch (err) {
        console.error(`Failed to update stack at index ${currentIndex}:`, err);
        setError(
          `Failed to render series: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    updateStack();
  }, [currentIndex, selectedSeriesUID, seriesList, isViewportReady]);

  // Update active tool
  useEffect(() => {
    if (toolGroupRef.current && activeTool) {
      const viewport = renderingEngineRef.current?.getViewport(
        viewportId
      ) as cornerstone.Types.IStackViewport;
      if (!viewport) {
        console.log("No viewport available for tool activation");
        return;
      }

      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      if (!selectedSeries || !selectedSeries.imageIds[currentIndex]) {
        console.log("No valid series or image for tool activation");
        return;
      }

      TOOLS.forEach((tool) =>
        toolGroupRef.current.setToolPassive(tool.toolName)
      );
      toolGroupRef.current.setToolActive(activeTool, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });

      // Restore stack to prevent image disappearance
      viewport.setStack(selectedSeries.imageIds, currentIndex).then(() => {
        viewport.render();
        console.log(`Tool activated: ${activeTool}, stack restored`);
      });
      const handleInteraction = () => {
        setZoomLevel(Math.round(viewport.getZoom() * 100));
      };
      const canvas = viewport.getCanvas();
      canvas.addEventListener("mousedown", handleInteraction);
      canvas.addEventListener("wheel", handleInteraction);
      return () => {
        canvas.removeEventListener("mousedown", handleInteraction);
        canvas.removeEventListener("wheel", handleInteraction);
      };
    }
  }, [activeTool, selectedSeriesUID, currentIndex, seriesList]);

  // Export image
  const exportImage = useCallback(() => {
    if (
      !renderingEngineRef.current ||
      !viewportRef.current ||
      !isViewportReady ||
      !metadata
    ) {
      setError("No image loaded to export.");
      return;
    }

    try {
      const viewport = renderingEngineRef.current.getViewport(
        viewportId
      ) as cornerstone.Types.IStackViewport;
      const canvas = viewport.getCanvas();
      const { width, height } = canvas;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ctx = exportCanvas.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      const patientID =
        metadata.patientID?.replace(/[^a-zA-Z0-9]/g, "_") || "Unknown";
      const seriesUID =
        metadata.seriesDescription?.replace(/[^a-zA-Z0-9]/g, "_") || "Unknown";
      const filename = `${patientID}_${seriesUID}_Image${currentIndex + 1}.png`;
      const link = document.createElement("a");
      link.href = exportCanvas.toDataURL("image/png");
      link.download = filename;
      link.click();
    } catch (err) {
      setError(
        `Failed to export image: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }, [isViewportReady, metadata, selectedSeriesUID, currentIndex, seriesList]);

  const activateTool = useCallback((toolName: string) => {
    setActiveTool(toolName);
  }, []);

  const fitToWindow = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport && viewportRef.current) {
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      const imageId = selectedSeries?.imageIds[currentIndex];
      const imageMetadata = imageId
        ? metadataMapRef.current.get(imageId)
        : undefined;
      if (imageMetadata && selectedSeries) {
        const { rows, columns } = imageMetadata.imagePixelModule;
        const scale =
          Math.min(
            viewportRef.current.clientWidth / columns,
            viewportRef.current.clientHeight / rows
          ) * VIEWPORT_SCALE;
        viewport.setZoom(scale);
        viewport.resetCamera();
        setZoomLevel(Math.round(viewport.getZoom() * 100));
        viewport.render();
      }
    }
  }, [selectedSeriesUID, currentIndex, seriesList]);

  const actualSize = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport) {
      viewport.setZoom(1.0);
      setZoomLevel(100);
      viewport.render();
    }
  }, []);

  const handleScroll = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastScrollTime.current < 300) return;
      lastScrollTime.current = now;

      const direction = Math.sign(event.deltaY);
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      if (selectedSeries) {
        const nextIndex = Math.min(
          Math.max(0, currentIndex + direction),
          selectedSeries.imageIds.length - 1
        );
        if (nextIndex !== currentIndex) {
          setCurrentIndex(nextIndex);
          console.log(`Scrolled to index: ${nextIndex}`);
        }
      }
    },
    [currentIndex, selectedSeriesUID, seriesList]
  );

  useEffect(() => {
    const element = viewportRef.current;
    if (element)
      element.addEventListener("wheel", handleScroll, { passive: false });
    return () => element?.removeEventListener("wheel", handleScroll);
  }, [handleScroll]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      if (!selectedSeries) return;
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      } else if (
        event.key === "ArrowRight" &&
        currentIndex < selectedSeries.imageIds.length - 1
      ) {
        setCurrentIndex(currentIndex + 1);
      }
    },
    [currentIndex, selectedSeriesUID, seriesList]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSeriesSelect = useCallback(
    (seriesUID: string) => {
      const series = seriesList.find((s) => s.seriesInstanceUID === seriesUID);
      if (series && series.imageIds.length > 0) {
        setSelectedSeriesUID(seriesUID);
        setCurrentIndex(0);
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
          console.log("Series selected:", seriesUID, { isViewportReady });
        }, 100);
      } else {
        setError("Invalid or empty series selected.");
      }
    },
    [seriesList]
  );

  const selectedSeries = seriesList.find(
    (s) => s.seriesInstanceUID === selectedSeriesUID
  );
  const seriesCount = selectedSeries?.imageIds.length || 0;

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-500 p-4">
        <Button className="mt-4" onClick={() => navigate("/")}>
          Back to Upload
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row bg-gray-50">
      <SeriesSidebar
        uploadType={uploadType}
        seriesList={seriesList}
        selectedSeriesUID={selectedSeriesUID}
        onSeriesSelect={handleSeriesSelect}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <ViewportToolbar
          activeTool={activeTool}
          zoomLevel={zoomLevel}
          currentIndex={currentIndex}
          seriesCount={seriesCount}
          isViewportReady={isViewportReady}
          selectedSeriesUID={selectedSeriesUID}
          onToolChange={activateTool}
          onIndexChange={setCurrentIndex}
          onFitToWindow={fitToWindow}
          onActualSize={actualSize}
          onExportImage={exportImage}
        />

        <div
          ref={containerRef}
          className="flex-1 bg-gray-100 relative overflow-hidden flex items-center justify-center"
        >
          <div
            ref={viewportRef}
            className="relative"
            style={{
              display: "inline-block",
              visibility: isViewportReady ? "visible" : "hidden",
            }}
          >
            {metadata && (
              <ViewportOverlay
                metadata={metadata}
                currentIndex={currentIndex}
                seriesCount={seriesCount}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Viewer;
