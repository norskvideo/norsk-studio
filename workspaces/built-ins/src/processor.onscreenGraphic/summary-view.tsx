import React, { ChangeEvent, useEffect, useState, useCallback } from "react";
import type {
  OnscreenGraphicState,
  OnscreenGraphicConfig,
  OnscreenGraphicCommand,
  OnscreenGraphicPosition,
} from "./runtime";
import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";

function SummaryView({
  state,
  sendCommand,
  urls,
}: ViewProps<
  OnscreenGraphicConfig,
  OnscreenGraphicState,
  OnscreenGraphicCommand
>) {
  const [graphic, setGraphic] = useState(state.activeGraphic?.file);
  const [position, setPosition] = useState(
    state.activeGraphic?.position ?? { x: 35, y: 20 }
  );
  const [graphics, setGraphics] = useState<string[]>([]);
  const [fileToUpload, setFileToUpload] = useState<File | undefined>(undefined);
  const [showFileInput, setShowFileInput] = useState(false);
  const [showUploadButton, setShowUploadButton] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    success: boolean;
    message: string | null;
  }>({ success: false, message: null });
  const [showDeleteDropdown, setShowDeleteDropdown] = useState(false);
  const [graphicToDelete, setGraphicToDelete] = useState<string>("");

  const updateGraphics = useCallback(async () => {
    try {
      const result = await fetch(`${urls.componentUrl}/graphics`);
      if (result.ok) {
        const newGraphics = (await result.json()) as string[];
        setGraphics(newGraphics);
      } else {
        throw new Error(await result.text());
      }
    } catch (error) {
      console.error("Failed to update graphics:", error);
      setUploadStatus({
        success: false,
        message: "Failed to update graphic list.",
      });
    }
  }, [urls.componentUrl]);

  useEffect(() => {
    updateGraphics().catch(console.error);
  }, [updateGraphics]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileToUpload(file);
    setShowUploadButton(!!file);
    setUploadStatus({ success: false, message: null });
  };

  const uploadFileHandle = async () => {
    if (!fileToUpload) return;

    try {
      const form = new FormData();
      form.append("file", fileToUpload);
      const response = await fetch(`${urls.componentUrl}/graphics`, {
        method: "POST",
        body: form,
      });

      if (response.status === 409) {
        const errorData = await response.json();
        setUploadStatus({
          success: false,
          message: `${errorData.error}. Delete the existing graphic first if you want to replace it.`,
        });
      } else if (!response.ok) {
        throw new Error("Upload failed");
      } else {
        setFileToUpload(undefined);
        setShowFileInput(false);
        setUploadStatus({
          success: true,
          message: "Graphic uploaded successfully!",
        });
        await updateGraphics();
      }
    } catch (error) {
      console.error("Failed to upload file:", error);
      setUploadStatus({ success: false, message: "Failed to upload graphic." });
    }

    setTimeout(() => setUploadStatus({ success: false, message: null }), 5000);
  };

  const uploadFile = () => {
    void uploadFileHandle();
  };

  const deleteBugHandle = async () => {
    if (!graphicToDelete) return;

    try {
      // DELETE doesn't require a body. This is a hack until I figure out
      // how to get openAPI to generate path parameters we can use with Swagger UI
      console.log(`${urls.componentUrl}`);
      const response = await fetch(`${urls.componentUrl}/graphic`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filename: graphicToDelete }),
      });
      if (response.ok) {
        setUploadStatus({
          success: true,
          message: "Graphic deleted successfully!",
        });
        await updateGraphics();
        if (graphic === graphicToDelete) {
          setGraphic(undefined);
          sendCommand({
            type: "change-graphic",
            file: undefined,
            position: undefined,
          });
        }
        setGraphicToDelete("");
        setShowDeleteDropdown(false);
      } else {
        const errorData = await response.json();
        setUploadStatus({
          success: false,
          message: errorData.error || "Failed to delete graphic",
        });
      }
    } catch (error) {
      console.error("Failed to delete graphic:", error);
      setUploadStatus({ success: false, message: "Failed to delete graphic" });
    }

    setTimeout(() => setUploadStatus({ success: false, message: null }), 3000);
  };

  const deleteBug = () => {
    void deleteBugHandle();
  };

  const videoWidth = state.graphic?.currentVideo?.width ?? 960;
  const videoHeight = state.graphic?.currentVideo?.height ?? 400;

  const buttonClass =
    "mt-2 mb-5 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800";
  const deleteButtonClass =
    "mt-2 text-white w-full justify-center bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-red-700 dark:hover:bg-red-800 dark:focus:ring-red-900";
  const fileInputClass =
    "block w-full text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400";
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
        Controls
      </h2>

      <div>
        <label
          htmlFor="select-graphic"
          className="block text-gray-900 dark:text-white mb-1"
        >
          Source
        </label>
        <select
          id="select-graphic"
          className="w-full node-editor-select-input"
          value={graphic || ""}
          onChange={(e) => setGraphic(e.target.value || undefined)}
        >
          <option value="">---</option>
          {graphics.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {graphic && (
        <div>
          <label
            htmlFor="select-position"
            className="block text-gray-900 dark:text-white mb-1"
          >
            Graphic position
          </label>
          <PositionSelector
            initialPosition={position}
            onChange={setPosition}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
          />
        </div>
      )}

      {(graphic !== state.activeGraphic?.file ||
        position !== state.activeGraphic?.position) && (
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            sendCommand({ type: "change-graphic", file: graphic, position })
          }
        >
          Commit
        </button>
      )}

      {!showFileInput && !uploadStatus.success && (
        <button
          type="button"
          className={buttonClass}
          onClick={() => setShowFileInput(true)}
          style={{ marginBottom: "1rem" }}
        >
          Upload Graphic
        </button>
      )}

      {showFileInput && (
        <form style={{ display: "block", marginBottom: "1rem" }}>
          <input
            type="file"
            id="file"
            name="filename"
            onChange={onFileChange}
            className={fileInputClass}
          />
          {showUploadButton && (
            <button type="button" className={buttonClass} onClick={uploadFile}>
              Upload
            </button>
          )}
        </form>
      )}

      <button
        type="button"
        className={deleteButtonClass}
        onClick={() => setShowDeleteDropdown(!showDeleteDropdown)}
        style={{ marginBottom: "1rem" }}
      >
        {showDeleteDropdown ? "Hide Delete Options" : "Delete Graphics"}
      </button>

      {showDeleteDropdown && (
        <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            Select Graphic to Delete
          </h3>
          <select
            className="w-full mb-2 node-editor-select-input"
            value={graphicToDelete}
            onChange={(e) => setGraphicToDelete(e.target.value)}
          >
            <option value=""> Select a graphic</option>
            {graphics.map((graphicName) => (
              <option key={graphicName} value={graphicName}>
                {graphicName}
              </option>
            ))}
          </select>
          <button
            onClick={deleteBug}
            disabled={!graphicToDelete}
            className={`${deleteButtonClass} ${
              !graphicToDelete ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            Delete Selected Graphic
          </button>
        </div>
      )}

      {uploadStatus.message && (
        <div
          className={`mt-2 text-center ${
            uploadStatus.success ? "text-green-600" : "text-red-600"
          }`}
        >
          {uploadStatus.message}
        </div>
      )}
    </div>
  );
}

type PositionUnit = "px" | "%";

type PositionSelectorProps = {
  initialPosition?: OnscreenGraphicPosition;
  onChange: (position: OnscreenGraphicPosition) => void;
  videoWidth: number;
  videoHeight: number;
};

const PositionSelector = ({
  initialPosition = { x: 100, y: 100 },
  onChange,
  videoWidth,
  videoHeight,
}: PositionSelectorProps) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [positionUnit, setPositionUnit] = useState<PositionUnit>("px");

  const HANDLE_SIZE = 24;

  const toPercentage = (value: number, total: number) => (value / total) * 100;
  const toPixels = (percentage: number, total: number) =>
    (percentage * total) / 100;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: { clientX: number; clientY: number }) => {
    if (!isDragging) return;

    const x = e.clientX - dragStart.x;
    const y = e.clientY - dragStart.y;

    const handleOffset = HANDLE_SIZE / 2;
    const newX = Math.min(
      Math.max(-handleOffset, x),
      videoWidth + handleOffset
    );
    const newY = Math.min(
      Math.max(-handleOffset, y),
      videoHeight + handleOffset
    );

    setPosition({ x: newX, y: newY });
    onChange?.({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const displayX =
    positionUnit === "%" ? toPercentage(position.x, videoWidth) : position.x;
  const displayY =
    positionUnit === "%" ? toPercentage(position.y, videoHeight) : position.y;

  return (
    <div className="relative w-full max-w-lg mx-auto mt-4 mb-8">
      <div className="mb-4 flex items-center gap-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Position Unit:
        </label>
        <select
          value={positionUnit}
          onChange={(e) => setPositionUnit(e.target.value as PositionUnit)}
          className="node-editor-select-input"
        >
          <option value="px">Pixels</option>
          <option value="%">Percentage</option>
        </select>
      </div>
      <div
        className="relative bg-gray-200 dark:bg-gray-700 rounded-lg"
        style={{ width: "100%", height: "200px" }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
          Video Preview Area
        </div>

        <div
          className={`absolute cursor-move p-2 rounded-lg bg-primary-500 bg-opacity-50 hover:bg-opacity-75 transition-colors
            ${isDragging ? "bg-opacity-75" : ""}`}
          style={{
            left: `${(position.x / videoWidth) * 100}%`,
            top: `${(position.y / videoHeight) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
          onMouseDown={handleMouseDown}
        >
          <svg
            className="w-6 h-6 text-white"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 6v12m-6-6h12m-6-6 1.5 1.5M12 6l-1.5 1.5m1.5 10.5L10.5 16.5M12 18l1.5-1.5M6 12l1.5-1.5M7.5 13.5 6 12m12 0-1.5-1.5M16.5 13.5 18 12"
            />
          </svg>
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 text-center">
        Position:{" "}
        {positionUnit === "%"
          ? `${displayX.toFixed(1)}%, ${displayY.toFixed(1)}%`
          : `${Math.round(displayX)}px, ${Math.round(displayY)}px`}
      </div>
      <div className="mt-2 flex gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            X Position {positionUnit}
          </label>
          <input
            type="number"
            step={positionUnit === "%" ? "0.1" : "1"}
            value={
              positionUnit === "%" ? displayX.toFixed(1) : Math.round(displayX)
            }
            onChange={(e) => {
              const value = Number(e.target.value);
              const newX =
                positionUnit === "%" ? toPixels(value, videoWidth) : value;
              setPosition((prev) => ({ ...prev, x: newX }));
              onChange?.({ ...position, x: newX });
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Y Position {positionUnit}
          </label>
          <input
            type="number"
            step={positionUnit === "%" ? "0.1" : "1"}
            value={
              positionUnit === "%" ? displayY.toFixed(1) : Math.round(displayY)
            }
            onChange={(e) => {
              const value = Number(e.target.value);
              const newY =
                positionUnit === "%" ? toPixels(value, videoHeight) : value;
              setPosition((prev) => ({ ...prev, y: newY }));
              onChange?.({ ...position, y: newY });
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
      </div>
    </div>
  );
};

export default SummaryView;
