import React, { ChangeEvent, useEffect, useState, useCallback, useRef } from "react";
import type {
  OnscreenGraphicState,
  OnscreenGraphicConfig,
  OnscreenGraphicCommand,
  OnscreenGraphicPosition,
  NamedPosition,
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
    state.activeGraphic?.position ?? { type: 'named' as const, position: 'topleft' as const }
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
      const result = await fetch(`${urls.staticUrl}/graphics`);
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
  }, [urls.staticUrl]);

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
      const response = await fetch(`${urls.staticUrl}/graphics`, {
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
      console.log(`${urls.staticUrl}`);
      const response = await fetch(`${urls.staticUrl}/graphic`, {
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

  const eqPosition = (l: OnscreenGraphicPosition, r?: OnscreenGraphicPosition) => {
    if (!r) return false;
    if (l.type === 'named') {
      if (r.type !== 'named') return false;
      return l.position === r.position;
    }
    if (r.type === 'named') return false;
    if (l.type !== r.type) return false;
    return l.x === r.x && l.y === r.y;
  };

  const graphicChanged = graphic !== state.activeGraphic?.file;
  const stateChanged = graphicChanged ||
    !eqPosition(position, state.activeGraphic?.position);

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
            graphicChanged={graphicChanged}
            {...state}
          />
        </div>
      )}

      <button
        type="button"
        className={`${buttonClass} ${!stateChanged ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() =>
          sendCommand({ type: "change-graphic", file: graphic, position })
        }
        disabled={!stateChanged}
      >
        Commit
      </button>

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
  currentVideo?: { width: number, height: number };
  currentGraphic?: { width: number, height: number };
  graphicChanged?: boolean;
};

type LocalPosition = OnscreenGraphicPosition & {
  x: number, y: number,
  // Keep percent values for displaying the visual indicator
  xPct: number, yPct: number,
  // Keep exact string values for the inputs, so we do not override the user
  xStr?: string, yStr?: string,
};
function fromLocalPosition(pos: LocalPosition): OnscreenGraphicPosition {
  if (pos.type === 'named') return { type: pos.type, position: pos.position };
  if (pos.type === 'coordinate') return { type: pos.type, x: pos.x, y: pos.y };
  if (pos.type === 'percentage') return { type: pos.type, x: pos.x, y: pos.y };
  assertUnreachable(pos);
}

function convertPosition(
  givenPosition?: OnscreenGraphicPosition & { xStr?: string, yStr?: string },
  currentVideo?: { width: number, height: number },
  currentGraphic?: { width: number, height: number },
): LocalPosition {
  if (!givenPosition) givenPosition = { type: 'named', position: 'topleft' };
  if (givenPosition.type === 'named') {
    let xy;
    if (givenPosition.position === 'topleft') {
      xy = { x: 0, y: 0 };
    } else if (givenPosition.position === 'topright') {
      xy = { x: 100, y: 0 };
    } else if (givenPosition.position === 'bottomleft') {
      xy = { x: 0, y: 100 };
    } else if (givenPosition.position === 'bottomright') {
      xy = { x: 100, y: 100 };
    } else if (givenPosition.position === 'center') {
      xy = { x: 50, y: 50 };
    } else {
      assertUnreachable(givenPosition.position);
    }
    return { ...givenPosition, ...xy, xPct: xy.x, yPct: xy.y };
  }
  if (givenPosition.type === 'coordinate') {
    if (!currentVideo || !currentGraphic) {
      return { ...givenPosition, xPct: 0, yPct: 0 };
    }
    const { width: videoWidth, height: videoHeight } = currentVideo;
    const { width: graphicWidth, height: graphicHeight } = currentGraphic;
    const maxX = videoWidth - graphicWidth;
    const maxY = videoHeight - graphicHeight;
    return {
      ...givenPosition,
      x: clamp(0, givenPosition.x, maxX),
      xPct: clamp(0, givenPosition.x * 100 / maxX, 100),
      y: clamp(0, givenPosition.y, maxY),
      yPct: clamp(0, givenPosition.y * 100 / maxY, 100),
    };
  }
  return { ...givenPosition, xPct: givenPosition.x, yPct: givenPosition.y };
}

const PositionSelector = ({
  initialPosition: givenPosition = { type: 'named', position: 'topleft' },
  onChange,
  currentVideo,
  currentGraphic,
  graphicChanged,
}: PositionSelectorProps) => {
  const convertPos =
    (pos: OnscreenGraphicPosition & { xStr?: string, yStr?: string }) =>
      convertPosition(pos, currentVideo, currentGraphic);

  const initialPosition = convertPos(givenPosition);
  const [position, setLocalPosition] = useState<LocalPosition>(initialPosition);
  const setPosition = (v: LocalPosition) => {setLocalPosition(v); onChange(fromLocalPosition(v))};
  const [positionUnit, setPositionUnit] = useState<PositionUnit>(position.type === 'coordinate' ? "px" : "%");

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ xPct: 0, yPct: 0, cx: 0, cy: 0 });

  const previewAreaRef = useRef<HTMLDivElement>(null);
  const previewTargetRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({
      ...position,
      cx: e.clientX,
      cy: e.clientY,
    });
    handleMouseMove(e);
  };

  const handleMouseMove = (e: { clientX: number; clientY: number }) => {
    if (!isDragging) return;

    const boundingBox = previewAreaRef.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
    const bbTarget = previewTargetRef.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
    const clientWidth = boundingBox.width - bbTarget.width;
    const clientHeight = boundingBox.height - bbTarget.height;
    const newX = clamp(0, dragStart.xPct + (e.clientX - dragStart.cx)*(100 / clientWidth), 100);
    const newY = clamp(0, dragStart.yPct + (e.clientY - dragStart.cy)*(100 / clientHeight), 100);

    if (positionUnit === 'px' && currentVideo && currentGraphic) {
      const { width: videoWidth, height: videoHeight } = currentVideo;
      const { width: graphicWidth, height: graphicHeight } = currentGraphic;
      const maxX = videoWidth - graphicWidth;
      const maxY = videoHeight - graphicHeight;
      setPosition({
        type: 'coordinate',
        x: newX * maxX / 100,
        y: newY * maxY / 100,
        xPct: newX,
        yPct: newY,
      });
    } else {
      setPosition({
        type: 'percentage',
        x: newX,
        y: newY,
        xPct: newX,
        yPct: newY,
      });
    }
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

  return (
    <div className="relative w-full max-w-lg mx-auto mt-4 mb-8">
      <div className="mb-4 flex items-center gap-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Position Type:
        </label>
        <select
          value={position.type}
          onChange={(e) => {
            const newType = e.target.value as 'named' | 'coordinate';
            if (newType === 'named') {
              setPosition(convertPos({ type: 'named', position: 'topleft' }));
            } else {
              setPositionUnit("%");
              setPosition({ ...convertPos(position), type: 'percentage' });
            }
          }}
          className="node-editor-select-input"
        >
          <option value="coordinate">Custom Position</option>
          <option value="named">Preset Position</option>
        </select>
      </div>

      {position.type === 'named' ? (
        <div className="mb-4">
          <select
            value={position.position}
            onChange={(e) => {
              setPosition(convertPos({
                type: 'named',
                position: e.target.value as NamedPosition['position']
              }));
            }}
            className="w-full node-editor-select-input"
          >
            <option value="topleft">Top Left</option>
            <option value="topright">Top Right</option>
            <option value="bottomleft">Bottom Left</option>
            <option value="bottomright">Bottom Right</option>
            <option value="center">Centered</option>
          </select>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Position Unit:
            </label>
            <select
              value={positionUnit}
              onChange={(e) => {
                setPositionUnit(e.target.value as PositionUnit);
                if (e.target.value === 'px' && position.type !== 'coordinate' && currentVideo && currentGraphic) {
                  const { width: videoWidth, height: videoHeight } = currentVideo;
                  const { width: graphicWidth, height: graphicHeight } = currentGraphic;
                  const maxX = videoWidth - graphicWidth;
                  const maxY = videoHeight - graphicHeight;
                  setPosition({
                    ...position,
                    type: 'coordinate',
                    x: position.xPct*maxX/100,
                    y: position.yPct*maxY/100,
                    xStr: undefined,
                    yStr: undefined,
                  });
                } else if (e.target.value === "%") {
                  setPosition({
                    ...position,
                    type: 'percentage',
                    x: position.xPct,
                    y: position.yPct,
                    xStr: undefined,
                    yStr: undefined,
                  });
                }
              }}
              className="node-editor-select-input"
            >
              <option value="px">Pixels</option>
              <option value="%">Percentage</option>
            </select>
          </div>

          <div
            className="relative bg-gray-200 dark:bg-gray-700 rounded-lg"
            style={{
              width: "100%",
              userSelect: "none",
              aspectRatio: currentVideo ? `${currentVideo.width} / ${currentVideo.height}` : `3 / 2`
            }}
            ref={previewAreaRef}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
              <span>{currentVideo ? "Video Preview Area" : "Video Dimensions Unknown"}</span>
              {" "}
              {currentVideo ? <span>{currentVideo.width}x{currentVideo.height}px</span> : ''}
            </div>

            <div
              className={`absolute cursor-move ${currentGraphic && !graphicChanged ? "" : "p-2"} rounded-lg bg-primary-500 bg-opacity-50 hover:bg-opacity-75 transition-colors
                ${isDragging ? "bg-opacity-75" : ""}`}
              style={{
                left: `${position.xPct}%`,
                top: `${position.yPct}%`,
                transform: `translate(-${position.xPct}%, -${position.yPct}%)`,
                aspectRatio: currentGraphic && !graphicChanged ? `${currentGraphic.width} / ${currentGraphic.height}` : `1`,
                width: currentGraphic && currentVideo && !graphicChanged ? (currentGraphic.width / currentVideo.width * 100)+"%" : undefined,
              }}
              onMouseDown={handleMouseDown}
              ref={previewTargetRef}
            >
              <svg
                className={`${currentGraphic && !graphicChanged ? "w-full h-full" : "w-6 h-6"} text-white`}
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
            {position.type === 'percentage'
              ? `${position.xPct.toFixed(1)}%, ${position.yPct.toFixed(1)}%`
              : `${Math.round(position.x)}px, ${Math.round(position.y)}px`}
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
                  position.xStr ??
                  ( positionUnit === "%"
                    ? position.xPct.toFixed(1)
                    : Math.round(position.x)
                  )
                }
                onChange={(e) => {
                  const newX = Number(e.target.value);
                  setPosition(convertPos({
                    type: positionUnit === "%" ? 'percentage' : 'coordinate',
                    x: newX,
                    xStr: e.target.value,
                    y: position.y,
                    yStr: position.yStr,
                  }));
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
                  position.yStr ??
                  ( positionUnit === "%"
                    ? position.yPct.toFixed(1)
                    : Math.round(position.y)
                  )
                }
                onChange={(e) => {
                  const newY = Number(e.target.value);
                  setPosition(convertPos({
                    type: positionUnit === "%" ? 'percentage' : 'coordinate',
                    x: position.x,
                    xStr: position.xStr,
                    y: newY,
                    yStr: e.target.value,
                  }));
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

function clamp(min: number, num: number, max: number): number {
  return num < min ? min : num > max ? max : num;
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}

export default SummaryView;
