import React, { ChangeEvent, useEffect, useState, useCallback } from "react";
import type { DynamicBugState, DynamicBugConfig, DynamicBugCommand, DynamicBugPosition } from "./runtime";
import { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";

function SummaryView({ state, sendCommand, urls }: ViewProps<DynamicBugConfig, DynamicBugState, DynamicBugCommand>) {
  const [bug, setBug] = useState(state.activeBug?.file);
  const [position, setPosition] = useState(state.activeBug?.position);
  const [bugs, setBugs] = useState<string[]>([]);
  const [fileToUpload, setFileToUpload] = useState<File | undefined>(undefined);
  const [showFileInput, setShowFileInput] = useState(false);
  const [showUploadButton, setShowUploadButton] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{success: boolean,message: string | null}>({ success: false, message: null });
  const [showDeleteDropdown, setShowDeleteDropdown] = useState(false);
  const [bugToDelete, setBugToDelete] = useState<string>("");

  const updateBugs = useCallback(async () => {
    try {
      const result = await fetch(`${urls.componentUrl}/bugs`);
      if (result.ok) {
        const newBugs = (await result.json()) as string[];
        setBugs(newBugs);
      } else {
        throw new Error(await result.text());
      }
    } catch (error) {
      console.error("Failed to update bugs:", error);
      setUploadStatus({
        success: false,
        message: "Failed to update bug list.",
      });
    }
  }, [urls.componentUrl]);

  useEffect(() => {
    updateBugs().catch(console.error);
  }, [updateBugs]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileToUpload(file);
    setShowUploadButton(!!file);
    setUploadStatus({ success: false, message: null });
  };

  const uploadFile = async () => {
    if (!fileToUpload) return;

    try {
      const form = new FormData();
      form.append("file", fileToUpload);
      const response = await fetch(`${urls.componentUrl}/bugs`, {
        method: "POST",
        body: form,
      });

      if (response.status === 409) {
        const errorData = await response.json();
        setUploadStatus({
          success: false,
          message: `${errorData.error}. Delete the existing bug first if you want to replace it.`,
        });
      } else if (!response.ok) {
        throw new Error("Upload failed");
      } else {
        setFileToUpload(undefined);
        setShowFileInput(false);
        setUploadStatus({
          success: true,
          message: "Bug uploaded successfully!",
        });
        await updateBugs();
      }
    } catch (error) {
      console.error("Failed to upload file:", error);
      setUploadStatus({ success: false, message: "Failed to upload bug." });
    }

    setTimeout(() => setUploadStatus({ success: false, message: null }), 5000);
  };

  const deleteBug = async () => {
    if (!bugToDelete) return;

    try {
      // This is a hack until I figure out how to get openAPI to generate path parameters 
      // we can use with Swagger UI
      const response = await fetch(`${urls.componentUrl}/bug`, {
        method: "DELETE",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: bugToDelete }),
      });
      
      // const response = await fetch(`${urls.componentUrl}/bugs/${filename}`, {
      //   method: "DELETE",
      // });

      if (response.ok) {
        setUploadStatus({
          success: true,
          message: "Bug deleted successfully!",
        });
        await updateBugs();
        if (bug === bugToDelete) {
          setBug(undefined);
          sendCommand({
            type: "change-bug",
            file: undefined,
            position: undefined,
          });
        }
        setBugToDelete("");
        setShowDeleteDropdown(false);
      } else {
        const errorData = await response.json();
        setUploadStatus({
          success: false,
          message: errorData.error || "Failed to delete bug",
        });
      }
    } catch (error) {
      console.error("Failed to delete bug:", error);
      setUploadStatus({ success: false, message: "Failed to delete bug" });
    }

    setTimeout(() => setUploadStatus({ success: false, message: null }), 3000);
  };

  const buttonClass = "mt-2 mb-5 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800";
  const deleteButtonClass = "mt-2 text-white w-full justify-center bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-red-700 dark:hover:bg-red-800 dark:focus:ring-red-900";
  const fileInputClass = "block w-full text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400";
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Controls</h2>

      <div>
        <label htmlFor="select-bug" className="block text-gray-900 dark:text-white mb-1">
          Source
        </label>
        <select
          id="select-bug"
          className="w-full node-editor-select-input"
          value={bug || ""}
          onChange={(e) => setBug(e.target.value || undefined)}
        >
          <option value="">---</option>
          {bugs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {bug && (
        <div>
          <label htmlFor="select-position" className="block text-gray-900 dark:text-white mb-1">
            Position
          </label>
          <select
            id="select-position"
            className="w-full node-editor-select-input"
            value={position}
            onChange={(e) => setPosition(e.target.value as DynamicBugPosition)}
          >
            <option value="topleft">Top Left</option>
            <option value="topright">Top Right</option>
            <option value="bottomleft">Bottom Left</option>
            <option value="bottomright">Bottom Right</option>
          </select>
        </div>
      )}

      {(bug !== state.activeBug?.file ||
        position !== state.activeBug?.position) && (
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            sendCommand({ type: "change-bug", file: bug, position })
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
          Upload  Bug
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
        {showDeleteDropdown ? "Hide Delete Options" : "Delete Bugs"}
      </button>

      {showDeleteDropdown && (
        <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            Select Bug to Delete
          </h3>
          <select 
            className="w-full mb-2 node-editor-select-input"
            value={bugToDelete}
            onChange={(e) => setBugToDelete(e.target.value)}
          >
            <option value=""> Select a bug</option>
            {bugs.map((bugName) => (
              <option key={bugName} value={bugName}>
                {bugName}
              </option>
            ))}
          </select>
          <button
            onClick={deleteBug}
            disabled={!bugToDelete}
            className={`${deleteButtonClass} ${!bugToDelete ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Delete Selected Bug
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

export default SummaryView;
