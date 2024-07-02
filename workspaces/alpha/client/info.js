var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// external-global-plugin:react
var require_react = __commonJS({
  "external-global-plugin:react"(exports, module) {
    module.exports = window.React;
  }
});

// external-global-plugin:react/jsx-runtime
var require_jsx_runtime = __commonJS({
  "external-global-plugin:react/jsx-runtime"(exports, module) {
    module.exports = window.ReactJsx;
  }
});

// ../../node_modules/@norskvideo/norsk-studio/lib/shared/shared-views.js
var require_shared_views = __commonJS({
  "../../node_modules/@norskvideo/norsk-studio/lib/shared/shared-views.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GlobalIceServerView = void 0;
    var jsx_runtime_1 = require_jsx_runtime();
    function GlobalIceServerView(i) {
      return (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-flow-row-dense grid-cols-3 text-sm", children: [(0, jsx_runtime_1.jsx)("div", { className: "col-span-1", children: "URL" }), (0, jsx_runtime_1.jsx)("div", { className: "col-span-2", children: i.url }), (0, jsx_runtime_1.jsx)("div", { className: "col-span-1", children: "Reported URL" }), (0, jsx_runtime_1.jsx)("div", { className: "col-span-2", children: i.reportedUrl ?? "" }), (0, jsx_runtime_1.jsx)("div", { className: "col-span-1", children: "Username" }), (0, jsx_runtime_1.jsx)("div", { className: "col-span-2", children: i.username ?? "" }), (0, jsx_runtime_1.jsx)("div", { className: "col-span-1", children: "Password" }), (0, jsx_runtime_1.jsx)("div", { className: "col-span-2", children: i.credential ?? "" })] });
    }
    exports.GlobalIceServerView = GlobalIceServerView;
  }
});

// ../../node_modules/@norskvideo/norsk-studio/lib/shared/config.js
var require_config = __commonJS({
  "../../node_modules/@norskvideo/norsk-studio/lib/shared/config.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RootDataDir = exports.HardwareSelection = exports.contractHardwareAcceleration = exports.GlobalIceServers = void 0;
    var react_1 = __importDefault(require_react());
    function GlobalIceServers2(f) {
      const GlobalIceServerView = react_1.default.lazy(async () => {
        const views = await Promise.resolve().then(() => __importStar(require_shared_views()));
        return { default: views.GlobalIceServerView };
      });
      const { validation: { Z } } = f;
      return {
        id: "ice-servers",
        form: {
          help: "ICE Servers to use for either STUN or TURN",
          hint: {
            envOverride: true,
            type: "form-list",
            form: {
              url: {
                help: "URL of the STUN/TURN server (with turn:/stun: prefix) as accessed by Norsk Studio",
                hint: {
                  type: "text",
                  validation: f.validation.IceServer
                }
              },
              reportedUrl: {
                help: "Optional URL of the STUN/TURN server as accessed by the client (if different to the above)",
                hint: {
                  type: "text",
                  validation: f.validation.IceServer
                }
              },
              username: {
                help: "Optional username",
                hint: {
                  type: "text",
                  validation: Z.string()
                }
              },
              credential: {
                help: "Optional password",
                hint: {
                  type: "text",
                  validation: Z.string()
                }
              }
            },
            view: GlobalIceServerView,
            defaultValue: [{
              url: "stun:stun.l.google.com:19302"
            }]
          }
        }
      };
    }
    exports.GlobalIceServers = GlobalIceServers2;
    function contractHardwareAcceleration(value, accepted) {
      if (!value)
        return void 0;
      const expanded = accepted;
      if (expanded.includes(value)) {
        return value;
      }
      return void 0;
    }
    exports.contractHardwareAcceleration = contractHardwareAcceleration;
    function HardwareSelection3() {
      return {
        id: "hardware-acceleration",
        form: {
          help: "Where available, use the specified hardware for encodes/compose operations",
          hint: {
            type: "select",
            optional: true,
            options: [
              { value: "ma35d", display: "MA35D" },
              { value: "quadra", display: "Quadra" },
              { value: "nvidia", display: "Nvidia" },
              { value: "logan", display: "Logan" }
            ]
          }
        }
      };
    }
    exports.HardwareSelection = HardwareSelection3;
    function RootDataDir() {
      return {
        id: "root-data-dir",
        form: {
          help: "The root data dir to use against relative file paths in components/etc",
          hint: {
            type: "text",
            defaultValue: "/"
          }
        }
      };
    }
    exports.RootDataDir = RootDataDir;
  }
});

// external-global-plugin:hls.js
var require_hls = __commonJS({
  "external-global-plugin:hls.js"(exports, module) {
    module.exports = window.HlsJs;
  }
});

// build/processor.actionReplay/summary.js
var summary_exports = {};
__export(summary_exports, {
  default: () => summary_default
});
function InlineView({ state, config, sendCommand }) {
  const url = state.contentPlayerUrl;
  const id = config.id;
  const previewVideo = (0, import_react.useRef)(null);
  const [lastSeek, setLastSeek] = (0, import_react.useState)(void 0);
  const [playbackDuration, setPlaybackDuration] = (0, import_react.useState)(10);
  (0, import_react.useEffect)(() => {
    if (!url)
      return;
    if (!previewVideo.current)
      return;
    if (import_hls.default.isSupported()) {
      const hls = new import_hls.default();
      hls.loadSource(url);
      hls.attachMedia(previewVideo.current);
    } else if (previewVideo.current.canPlayType("application/vnd.apple.mpegurl")) {
      previewVideo.current.src = url;
    }
  }, [state.contentPlayerUrl]);
  if (!url)
    return (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "..." });
  return (0, import_jsx_runtime.jsxs)("div", { className: "mb-5", children: [(0, import_jsx_runtime.jsx)("h5", { children: "Preview" }), (0, import_jsx_runtime.jsx)("video", { ref: previewVideo, controls: true, onSeeked, autoPlay: true, muted: true, className: state.replaying ? "hidden" : "", id: `${id}-video` }), state.replaying ? (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Current Performing Replay" }) : (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [lastSeek ? (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [(0, import_jsx_runtime.jsxs)("p", { children: ["Replay from ", lastSeek.time.toFixed(1), "(s) "] }), (0, import_jsx_runtime.jsxs)("p", { className: "block mb-2 text-sm font-medium text-gray-900 dark:text-white", children: ["Duration: ", playbackDuration, "s"] }), (0, import_jsx_runtime.jsx)("input", { id: "duration-range", type: "range", min: currentMinDuration(), max: currentMaxDuration(), defaultValue: playbackDuration, className: "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700", onChange: onDurationChange, onInput: onDurationChange })] }) : (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, {}), (0, import_jsx_runtime.jsx)("button", { onClick: sendReplayCommand, type: "button", className: "mt-2 mb-2 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800", children: "Replay" })] })] });
  function sendReplayCommand() {
    if (!previewVideo.current)
      return;
    if (!lastSeek)
      return;
    const fromHead = previewVideo.current.duration - lastSeek.time;
    sendCommand({
      type: "do-replay",
      from: fromHead,
      duration: playbackDuration
    });
  }
  function onDurationChange(e) {
    const v = parseInt(e.currentTarget.value, 10);
    setPlaybackDuration(v);
  }
  function currentMinDuration() {
    if (!previewVideo.current || !lastSeek)
      return 10;
    return Math.min(10, previewVideo.current.duration - lastSeek.time);
  }
  function currentMaxDuration() {
    if (!previewVideo.current || !lastSeek)
      return 30;
    return Math.min(30, previewVideo.current.duration - lastSeek.time);
  }
  function onSeeked() {
    if (changingDuration) {
      changingDuration = false;
      return;
    }
    const v = previewVideo.current;
    if (v?.currentTime && v.duration)
      setLastSeek({ time: v?.currentTime, end: v?.duration });
    else
      setLastSeek(void 0);
  }
}
var import_jsx_runtime, import_react, import_hls, changingDuration, summary_default;
var init_summary = __esm({
  "build/processor.actionReplay/summary.js"() {
    "use strict";
    import_jsx_runtime = __toESM(require_jsx_runtime());
    import_react = __toESM(require_react());
    import_hls = __toESM(require_hls());
    changingDuration = false;
    summary_default = InlineView;
  }
});

// build/processor.audioLevel/inline-view.js
var inline_view_exports = {};
__export(inline_view_exports, {
  default: () => inline_view_default
});
function InlineView2({ state }) {
  function percentage(levels) {
    if (!levels) {
      return 0;
    }
    if (levels.peak == 0 && levels.rms == 0) {
      return 0;
    }
    const rebase = levels.rms - 12;
    const capped = 0 - rebase / 112;
    const snapped = Math.floor(capped * 10) * 10;
    return Math.max(0, 100 - snapped);
  }
  if (!state.levels) {
    return (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, {});
  }
  return (0, import_jsx_runtime2.jsx)("div", { className: "audio-level-container-inline", children: (0, import_jsx_runtime2.jsx)("div", { className: "preview-levels-inline", children: (0, import_jsx_runtime2.jsx)("div", { className: `preview-level clip-${percentage(state.levels)}` }) }) });
}
var import_jsx_runtime2, inline_view_default;
var init_inline_view = __esm({
  "build/processor.audioLevel/inline-view.js"() {
    "use strict";
    import_jsx_runtime2 = __toESM(require_jsx_runtime());
    inline_view_default = InlineView2;
  }
});

// build/processor.audioLevel/summary-view.js
var summary_view_exports = {};
__export(summary_view_exports, {
  default: () => summary_view_default
});
function SummaryView({ state, sendCommand }) {
  const [sliderValue, setSliderValue] = (0, import_react3.useState)(state.sliderGain || "0");
  const [canSetVolume, setCanSetVolume] = (0, import_react3.useState)(true);
  const throttleDelay = 100;
  function percentage(levels) {
    if (!levels) {
      return 0;
    }
    if (levels.peak == 0 && levels.rms == 0) {
      return 0;
    }
    const rebase = levels.rms - 12;
    const capped = 0 - rebase / 112;
    const snapped = Math.floor(capped * 10) * 10;
    return Math.max(0, 100 - snapped);
  }
  const gainClasses = state.levels ? "col-start-2 self-end" : "col-start-1 col-end-3 self-end justify-self-start";
  return (0, import_jsx_runtime3.jsxs)("div", { className: "audio-level-container grid mb-6 relative justify-items-center", children: [(0, import_jsx_runtime3.jsxs)("div", { className: `preview-levels-summary ${state.levels ? "" : "opacity-30"}`, children: [(0, import_jsx_runtime3.jsx)("div", { className: "relative w-full h-full", children: (0, import_jsx_runtime3.jsx)("div", { className: `preview-level absolute h-full w-4/6 clip-${percentage(state.levels)}` }) }), (0, import_jsx_runtime3.jsxs)("div", { className: "relative", children: [(0, import_jsx_runtime3.jsx)("div", { className: "text-sm absolute -top-1", children: "0dB" }), (0, import_jsx_runtime3.jsx)("div", { className: "text-sm absolute top-14", children: "-50dB" }), (0, import_jsx_runtime3.jsx)("div", { className: "text-sm absolute -bottom-2", children: "-100dB" })] })] }), (0, import_jsx_runtime3.jsx)("div", { className: "h-full flex items-center", children: (0, import_jsx_runtime3.jsx)("input", { id: "audio-slider", className: `-rotate-90 h-2.5 ${state.levels ? "" : "opacity-20"}`, type: "range", name: "gain", min: "-40", max: "40", step: "1", defaultValue: state.sliderGain || "0", disabled: !state.levels, onChange: (e) => {
    setSliderValue(e.target.value);
    if (canSetVolume) {
      setCanSetVolume(false);
      sendCommand({ type: "set-gain", value: Number(e.target.value) });
      setTimeout(() => {
        setCanSetVolume(true);
      }, throttleDelay);
    }
  }, onMouseUp: (_e) => {
    sendCommand({ type: "set-gain", value: Number(sliderValue) });
  } }) }), (0, import_jsx_runtime3.jsx)("div", { className: gainClasses, children: state.levels ? "Gain:" : "No incoming audio" }), (0, import_jsx_runtime3.jsx)("div", { className: "col-start-2", children: state.levels ? `${Number(sliderValue) > 0 ? "+" : ""} ${sliderValue} dB` : "" })] });
}
var import_jsx_runtime3, import_react3, summary_view_default;
var init_summary_view = __esm({
  "build/processor.audioLevel/summary-view.js"() {
    "use strict";
    import_jsx_runtime3 = __toESM(require_jsx_runtime());
    import_react3 = __toESM(require_react());
    summary_view_default = SummaryView;
  }
});

// build/processor.audioMixer/inline-view.js
var inline_view_exports2 = {};
__export(inline_view_exports2, {
  default: () => inline_view_default2,
  mkSourceKey: () => mkSourceKey
});
function mkSourceKey(sourceId, key) {
  return key ? sourceId + "-" + key : sourceId;
}
function InlineView3({ state }) {
  function percentage(levels) {
    if (!levels) {
      return 0;
    }
    if (levels.peak == 0 && levels.rms == 0) {
      return 0;
    }
    const rebase = levels.rms - 12;
    const capped = 0 - rebase / 112;
    const snapped = Math.floor(capped * 10) * 10;
    return Math.max(0, 100 - snapped);
  }
  const sourcesOrdered = state.knownSources.filter(({ id }) => id !== "mixer-output");
  const mixerOutput = state.knownSources.find(({ id }) => id === "mixer-output");
  if (mixerOutput) {
    sourcesOrdered.push(mixerOutput);
  }
  function mkGridColumns() {
    const gridRows = Array(Math.ceil((sourcesOrdered.length - 1) / 3)).fill("108px");
    return {
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      ["gridTemplateRows"]: gridRows.join(" ")
    };
  }
  return !state.displayInlineChannels ? (0, import_jsx_runtime4.jsx)(import_jsx_runtime4.Fragment, {}) : (0, import_jsx_runtime4.jsx)("div", { id: "mixer-level-container-inline", className: "grid mt-4", style: mkGridColumns(), children: sourcesOrdered.map((s, i) => {
    const source = state.sources[mkSourceKey(s.id, s.key)];
    const isMasterOutput = i == sourcesOrdered.length - 1;
    if (source) {
      return (0, import_jsx_runtime4.jsx)("div", { className: `grid justify-start w-full ${isMasterOutput ? "inline-master-channel" : ""}`, children: (0, import_jsx_runtime4.jsxs)("div", { title: s.key ?? s.id, className: `preview-levels dark:text-slate-100 text-black relative ${isMasterOutput ? "inline-master-border" : ""}`, children: [(0, import_jsx_runtime4.jsx)("div", { className: "inline-channel-name absolute", children: isMasterOutput ? "Master" : s.key ?? s.id }), (0, import_jsx_runtime4.jsx)("div", { className: `preview-level clip-${percentage(source.levels)}` })] }) }, mkSourceKey(s.id, s.key));
    }
    return (0, import_jsx_runtime4.jsx)(import_jsx_runtime4.Fragment, {});
  }) });
}
var import_jsx_runtime4, inline_view_default2;
var init_inline_view2 = __esm({
  "build/processor.audioMixer/inline-view.js"() {
    "use strict";
    import_jsx_runtime4 = __toESM(require_jsx_runtime());
    inline_view_default2 = InlineView3;
  }
});

// build/processor.audioMixer/fullscreen-view.js
var fullscreen_view_exports = {};
__export(fullscreen_view_exports, {
  default: () => fullscreen_view_default,
  mkSourceKey: () => mkSourceKey2
});
function mkSourceKey2(sourceId, key) {
  return key ? sourceId + "-" + key : sourceId;
}
function FullScreen({ state, sendCommand }) {
  const initialSliders = {};
  const initialPreMuteSliders = {};
  Object.keys(state.sources).forEach((k) => {
    if (state.sources[k]) {
      initialSliders[k] = state.sources[k].sliderGain || 0;
      initialPreMuteSliders[k] = state.sources[k].preMuteSliderGain || 0;
    }
  });
  const initialCanSetVolume = {};
  state.knownSources.forEach(({ id, key }) => initialCanSetVolume[mkSourceKey2(id, key)] = true);
  const [canSetVolume, setCanSetVolume] = (0, import_react5.useState)(initialCanSetVolume);
  const [sliderValues, setSliderValue] = (0, import_react5.useState)(initialSliders);
  const [preMuteValues, setPreMuteValues] = (0, import_react5.useState)(initialPreMuteSliders);
  const throttleDelay = 100;
  function percentage(levels) {
    if (!levels) {
      return 0;
    }
    if (levels.peak == 0 && levels.rms == 0) {
      return 0;
    }
    const rebase = levels.rms - 12;
    const capped = 0 - rebase / 112;
    const snapped = Math.floor(capped * 10) * 10;
    return Math.max(0, 100 - snapped);
  }
  function mkFader(sourceId, key) {
    const source = mkSourceKey2(sourceId, key);
    const levels = state.sources[source];
    return (0, import_jsx_runtime5.jsxs)("div", { id: `audio-slider-${sourceId}${key ? "-" + key : ""}`, className: `${!levels?.levels ? "opacity-20" : ""} audio-mixer-fader-container grid content-center justify-center w-full relative`, children: [(0, import_jsx_runtime5.jsx)("input", { className: "-rotate-90 audio-mixer-fader", type: "range", name: "gain", min: state.gainRange.minGain - 0.1, max: state.gainRange.maxGain, step: "0.1", value: levels?.sliderGain || 0, disabled: !levels?.levels, onChange: (e) => {
      sliderValues[source] = Number(e.target.value);
      if (Number(e.target.value) < state.gainRange.minGain) {
        preMuteValues[source] = state.gainRange.minGain;
      } else {
        preMuteValues[source] = Number(e.target.value);
      }
      setSliderValue(sliderValues);
      setPreMuteValues(sliderValues);
      if (state.sources[source].isMuted) {
        sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: preMuteValues[source] || 0, muted: false });
      }
      if (Number(e.target.value) < state.gainRange.minGain) {
        sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: state.gainRange.minGain, muted: true });
      }
      if (canSetVolume[source] === true) {
        canSetVolume[source] = false;
        setCanSetVolume(canSetVolume);
        sendCommand({ type: "set-gain-cmd", sourceId, key, value: Number(e.target.value) });
        setTimeout(() => {
          canSetVolume[source] = true;
          setCanSetVolume(canSetVolume);
        }, throttleDelay);
      }
    }, onMouseUp: (_e) => {
      sendCommand({ type: "set-gain-cmd", sourceId, key, value: sliderValues[source] || 0 });
    } }), (0, import_jsx_runtime5.jsxs)("div", { className: "grid mixer-gain-db ml-2.5 absolute self-center", children: [(0, import_jsx_runtime5.jsxs)("div", { className: "text-xs absolute border-t w-12", children: [state.gainRange.maxGain, "dB"] }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsxs)("div", { className: "text-xs self-end border-b w-12", children: [state.gainRange.maxGain * 0.75, "dB"] }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsxs)("div", { className: "text-xs self-end border-b w-12", children: [state.gainRange.maxGain * 0.5, "dB"] }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsxs)("div", { className: "text-xs self-end border-b w-12", children: [state.gainRange.maxGain * 0.25, "dB"] }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-12", children: "0dB" }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsxs)("div", { className: "text-xs self-end border-b w-12", children: [state.gainRange.minGain * 0.25, "dB"] }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsxs)("div", { className: "text-xs self-end border-b w-12", children: [state.gainRange.minGain * 0.5, "dB"] }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsxs)("div", { className: "text-xs self-end border-b w-12", children: [state.gainRange.minGain * 0.75, "dB"] }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-4 h-4" }), (0, import_jsx_runtime5.jsxs)("div", { className: "text-xs self-end border-b w-12", children: [state.gainRange.minGain, "dB"] })] })] });
  }
  function mkLevels(sourceId, key) {
    const sourceKey = mkSourceKey2(sourceId, key);
    const levels = state.sources[sourceKey];
    const mutedClass = sliderValues[sourceKey] < state.gainRange.minGain || state.sources[sourceKey]?.isMuted ? "level-muted" : "";
    return (0, import_jsx_runtime5.jsxs)("div", { id: `level-${sourceId}${key ? "-" + key : ""}`, className: `preview-levels-mixer ${!state.sources[sourceKey]?.levels ? "opacity-30" : ""}`, children: [(0, import_jsx_runtime5.jsx)("div", { className: "relative w-full h-full", children: (0, import_jsx_runtime5.jsx)("div", { className: `preview-level-mixer absolute h-full w-4/6 clip-${percentage(levels?.levels)} ${mutedClass}` }) }), (0, import_jsx_runtime5.jsxs)("div", { className: "grid mixer-level-db ml-2.5 relative", children: [(0, import_jsx_runtime5.jsx)("div", { className: "text-xs absolute border-t w-12 -right-3.5", children: "0dB" }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-12", children: "-25dB" }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-12", children: "-50dB" }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-12", children: "-75dB" }), (0, import_jsx_runtime5.jsx)("div", { className: "text-xs self-end border-b w-12", children: "-100dB" })] })] });
  }
  function mkGainValue(sourceId, key) {
    const sourceKey = mkSourceKey2(sourceId, key);
    const sliderValue = sliderValues[sourceKey];
    const sliderValueText = sliderValue === void 0 ? "- dB" : sliderValue < state.gainRange.minGain || state.sources[sourceKey]?.isMuted ? "muted" : sliderValue + "dB";
    return (0, import_jsx_runtime5.jsx)("div", { id: `gain-value-${sourceId}${key ? "-" + key : ""}`, className: `${!state.sources[sourceKey]?.levels ? "opacity-20" : ""} text-m`, children: sliderValueText });
  }
  function muteIcon(sourceId, key) {
    const sourceKey = mkSourceKey2(sourceId, key);
    const mute = (0, import_jsx_runtime5.jsx)("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: "1.5", stroke: "currentColor", className: "w-6 h-6", children: (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" }) });
    const unMute = (0, import_jsx_runtime5.jsx)("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: "1.5", stroke: "currentColor", className: "w-6 h-6", children: (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" }) });
    return (0, import_jsx_runtime5.jsx)("div", { className: `${!state.sources[sourceKey]?.levels ? "opacity-20" : ""} mute-icon self-center`, onClick: (_e) => {
      if (state.sources[sourceKey]) {
        if (state.sources[sourceKey].isMuted) {
          sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: preMuteValues[sourceKey] || 0, muted: false });
        } else {
          sendCommand({ type: "switch-mute-cmd", sourceId, key, preMuteSliderValue: preMuteValues[sourceKey] || 0, muted: true });
        }
      } else {
        console.warn("Could not find source with source key: " + sourceKey);
      }
    }, children: state.sources[sourceKey]?.isMuted ? mute : unMute });
  }
  const sourcesOrdered = state.knownSources.filter(({ id }) => id !== "mixer-output");
  const mixerOutput = state.knownSources.find(({ id }) => id === "mixer-output");
  if (mixerOutput) {
    sourcesOrdered.push(mixerOutput);
  }
  function mkGridColumns() {
    const gridColumns = Array(state.knownSources.length).fill("140px");
    return {
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      ["gridTemplateColumns"]: gridColumns.join(" ")
    };
  }
  return (0, import_jsx_runtime5.jsx)("div", { className: "audio-mixer grid gap-x-8 justify-items-center", style: mkGridColumns(), children: sourcesOrdered.map((s, i) => {
    const isMasterOutput = i == sourcesOrdered.length - 1;
    const divKey = `${s.id}${s.key ? "-" + s.key : ""}`;
    return (0, import_jsx_runtime5.jsxs)("div", { className: `channel-container grid justify-items-center ${isMasterOutput ? "bg-gray-700 ml-12" : ""} `, children: [(0, import_jsx_runtime5.jsx)("div", { id: `channel-title-${divKey}`, children: isMasterOutput ? "Master" : s.key ?? s.id }), mkLevels(s.id, s.key), muteIcon(s.id, s.key), mkFader(s.id, s.key), mkGainValue(s.id, s.key)] }, divKey);
  }) });
}
var import_jsx_runtime5, import_react5, fullscreen_view_default;
var init_fullscreen_view = __esm({
  "build/processor.audioMixer/fullscreen-view.js"() {
    "use strict";
    import_jsx_runtime5 = __toESM(require_jsx_runtime());
    import_react5 = __toESM(require_react());
    fullscreen_view_default = FullScreen;
  }
});

// build/processor.audioMixer/summary-view.js
var summary_view_exports2 = {};
__export(summary_view_exports2, {
  default: () => summary_view_default2
});
function SummaryView2({ state, sendCommand }) {
  return (0, import_jsx_runtime6.jsxs)("div", { className: "mb-8", children: [(0, import_jsx_runtime6.jsx)("label", { className: "mr-2.5", htmlFor: "disable-inline", children: "Display inline channels" }), (0, import_jsx_runtime6.jsx)("input", { checked: state.displayInlineChannels, type: "checkbox", id: "disable-inline", onChange: (e) => {
    const display = e.target.checked;
    sendCommand({ type: "display-inline-channels-cmd", display });
  } })] });
}
var import_jsx_runtime6, summary_view_default2;
var init_summary_view2 = __esm({
  "build/processor.audioMixer/summary-view.js"() {
    "use strict";
    import_jsx_runtime6 = __toESM(require_jsx_runtime());
    summary_view_default2 = SummaryView2;
  }
});

// external-global-plugin:@norskvideo/webrtc-client
var require_webrtc_client = __commonJS({
  "external-global-plugin:@norskvideo/webrtc-client"(exports, module) {
    module.exports = window.WebRtcClient;
  }
});

// build/processor.monetise/summary.js
var summary_exports2 = {};
__export(summary_exports2, {
  default: () => summary_default2
});
function InlineView4({ state, config, sendCommand }) {
  const url = state.url;
  const id = config.id;
  const previewVideo = (0, import_react7.useRef)(null);
  const durationSlider = (0, import_react7.useRef)(null);
  (0, import_react7.useEffect)(() => {
    if (!url)
      return;
    setTimeout(() => {
      if (!url)
        return;
      if (!previewVideo.current)
        return;
      const client = new import_webrtc_client.WhepClient({ url, container: previewVideo.current });
      void client.start();
    }, 1e3);
  }, [state.url]);
  if (!url)
    return (0, import_jsx_runtime7.jsx)(import_jsx_runtime7.Fragment, { children: "Starting up..." });
  return (0, import_jsx_runtime7.jsxs)("div", { className: "mb-5", children: [(0, import_jsx_runtime7.jsx)("div", { ref: previewVideo, className: "", id: `preview-${id}` }), state.currentAdvert ? (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: ["Advert currently playing: ", Math.floor(state.currentAdvert.timeLeftMs / 1e3), "s"] }) : (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [(0, import_jsx_runtime7.jsxs)("label", { htmlFor: "default-range", className: "block mb-2 text-sm font-medium text-gray-900 dark:text-white", children: ["Advert Duration (", durationSlider.current?.value ?? 16, "s)"] }), (0, import_jsx_runtime7.jsx)("input", { ref: durationSlider, id: "default-range", type: "range", defaultValue: "16", min: "16", max: "120", className: "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" }), (0, import_jsx_runtime7.jsx)("button", { onClick: sendAdvertCommand, type: "button", className: "mt-2 mb-2 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800", children: "Inject Advert" })] })] });
  function sendAdvertCommand() {
    if (!previewVideo.current)
      return;
    if (!durationSlider.current)
      return;
    sendCommand({
      type: "inject-advert",
      durationMs: parseInt(durationSlider.current.value, 10) * 1e3
    });
  }
}
var import_jsx_runtime7, import_react7, import_webrtc_client, summary_default2;
var init_summary2 = __esm({
  "build/processor.monetise/summary.js"() {
    "use strict";
    import_jsx_runtime7 = __toESM(require_jsx_runtime());
    import_react7 = __toESM(require_react());
    import_webrtc_client = __toESM(require_webrtc_client());
    summary_default2 = InlineView4;
  }
});

// build/processor.actionReplay/info.js
var import_react2 = __toESM(require_react());
var import_config = __toESM(require_config());
function info_default({ defineComponent, assertUnreachable: assertUnreachable4, Av }) {
  const SummaryView3 = import_react2.default.lazy(async () => Promise.resolve().then(() => (init_summary(), summary_exports)));
  return defineComponent({
    identifier: "processor.transform.actionReplay",
    category: "processor",
    name: "Action Replay",
    subscription: {
      accepts: {
        type: "single-stream",
        media: Av
      },
      produces: {
        type: "single-stream",
        media: Av
      }
    },
    extraValidation: (ctx) => {
      if (ctx.subscriptions.length == 0) {
        return;
      }
      if (ctx.subscriptions.length > 1) {
        ctx.addError("Action replay can only subscribe to a single source");
        return;
      }
      if (!ctx.subscriptions[0].streams.select.includes("audio")) {
        ctx.addError("Action replay requires audio in the subscription");
      }
      if (!ctx.subscriptions[0].streams.select.includes("video")) {
        ctx.addError("Action replay requires video in the subscription");
      }
    },
    runtime: {
      summary: SummaryView3,
      initialState: () => ({
        replaying: false,
        contentPlayerUrl: void 0
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "content-player-created":
            return { ...state, contentPlayerUrl: ev.url };
          case "replay-started":
            return { ...state, replaying: true };
          case "replay-finished":
            return { ...state, replaying: false };
          default:
            return assertUnreachable4(evType);
        }
      }
    },
    display: (desc) => {
      const { __global: _, ...rem } = desc.config;
      return rem;
    },
    configForm: {
      global: {
        hardware: (0, import_config.HardwareSelection)()
      },
      form: {}
    }
  });
}

// build/processor.audioLevel/info.js
var import_react4 = __toESM(require_react());
function info_default2({ defineComponent, Audio, validation: { Z } }) {
  const InlineView5 = import_react4.default.lazy(async () => Promise.resolve().then(() => (init_inline_view(), inline_view_exports)));
  const SummaryView3 = import_react4.default.lazy(async () => Promise.resolve().then(() => (init_summary_view(), summary_view_exports)));
  return defineComponent({
    identifier: "processor.audioLevel",
    category: "processor",
    name: "Audio Levels",
    subscription: {
      // Only accept a single audio stream
      accepts: {
        type: "single-stream",
        media: Audio
      },
      produces: {
        type: "single-stream",
        media: Audio
      }
    },
    extraValidation: function(ctx) {
      ctx.requireAudio(1);
    },
    display: (_desc) => {
      return {};
    },
    css: ["styles.css"],
    runtime: {
      initialState: () => ({}),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case "audio-levels":
            state.levels = ev.levels;
            break;
          case "set-gain":
            state.sliderGain = ev.sliderGain;
            state.nodeGain = ev.nodeGain;
            break;
          default:
            assertUnreachable(evType);
        }
        return { ...state };
      },
      inline: InlineView5,
      summary: SummaryView3
    },
    configForm: {
      form: {
        defaultGain: { help: "The default gain for audio dB", hint: { type: "numeric", validation: Z.number().gte(-40).lte(40), defaultValue: 0 } }
      }
    }
  });
}
function assertUnreachable(_) {
  throw new Error("Didn't expect to get here");
}

// build/processor.audioMixer/info.js
var import_react6 = __toESM(require_react());
function mkSourceKey3(sourceId, key) {
  return key ? sourceId + "-" + key : sourceId;
}
function info_default3({ defineComponent, Audio, validation: { Z } }) {
  const InlineView5 = import_react6.default.lazy(async () => Promise.resolve().then(() => (init_inline_view2(), inline_view_exports2)));
  const FullscreenView = import_react6.default.lazy(async () => Promise.resolve().then(() => (init_fullscreen_view(), fullscreen_view_exports)));
  const SummaryView3 = import_react6.default.lazy(async () => Promise.resolve().then(() => (init_summary_view2(), summary_view_exports2)));
  return defineComponent({
    identifier: "processor.audioMixer",
    category: "processor",
    name: "Audio Mixer",
    subscription: {
      accepts: {
        type: "multi-stream",
        media: Audio
      },
      produces: {
        type: "single-stream",
        media: Audio
      }
    },
    extraValidation: function(ctx) {
      ctx.requireAudio(1);
    },
    display: (_desc) => {
      return {};
    },
    css: ["styles.css"],
    runtime: {
      initialState: () => ({
        sources: {},
        knownSources: [],
        gainRange: { minGain: -40, maxGain: 40 },
        displayInlineChannels: true
      }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case "audio-levels": {
            const source = state.sources[mkSourceKey3(ev.sourceId, ev.key)] || { isMuted: false, sliderGain: 0 };
            state.sources[mkSourceKey3(ev.sourceId, ev.key)] = { ...source, levels: ev.levels };
            break;
          }
          case "set-gain": {
            const source = state.sources[mkSourceKey3(ev.sourceId, ev.key)] || { isMuted: false, sliderGain: 0 };
            let isMuted = ev.nodeGain === null ? true : source.isMuted;
            if (source.isMuted && typeof ev.nodeGain === "number") {
              isMuted = false;
            }
            state.sources[mkSourceKey3(ev.sourceId, ev.key)] = { ...source, sliderGain: ev.sliderGain, nodeGain: ev.nodeGain, isMuted };
            break;
          }
          case "sources-discovered": {
            state.knownSources = ev.sources;
            break;
          }
          case "switch-mute": {
            const source = state.sources[mkSourceKey3(ev.sourceId, ev.key)] || { isMuted: false, sliderGain: 0 };
            source.preMuteSliderGain = ev.preMuteSliderValue;
            if (source) {
              if (ev.muted) {
                source.sliderGain = -99;
              } else {
                source.sliderGain = ev.preMuteSliderValue;
              }
            }
            state.sources[mkSourceKey3(ev.sourceId, ev.key)] = { ...source, isMuted: ev.muted };
            break;
          }
          case "source-dropped": {
            const keyToDelete = mkSourceKey3(ev.sourceId, ev.key);
            const newSources = {};
            Object.keys(state.sources).forEach((s) => {
              if (s !== keyToDelete) {
                newSources[s] = state.sources[s];
              }
            });
            state.sources = newSources;
            break;
          }
          case "display-inline-channels": {
            state.displayInlineChannels = ev.display;
            break;
          }
          default:
            assertUnreachable2(evType);
        }
        return { ...state };
      },
      inline: InlineView5,
      fullscreen: FullscreenView,
      summary: SummaryView3
    },
    configForm: {
      form: {
        defaultGain: { help: "The default gain for audio dB", hint: { type: "numeric", validation: Z.number().gte(-40).lte(40), defaultValue: 0 } },
        channelLayout: {
          help: "Channel layout for audio output",
          hint: {
            type: "select",
            options: channelLayouts().map((ch) => {
              return { value: ch, display: ch };
            })
          }
        }
      }
    }
  });
}
var channelLayouts = () => {
  const ch = [
    "mono",
    "stereo",
    "surround",
    "4.0",
    "5.0",
    "5.1",
    "7.1",
    "5.1.4",
    "7.1.4"
  ];
  return ch;
};
function assertUnreachable2(_) {
  throw new Error("Didn't expect to get here");
}

// build/processor.monetise/info.js
var import_react8 = __toESM(require_react());
var import_config2 = __toESM(require_config());
function info_default4(R) {
  const { defineComponent, Av } = R;
  const SummaryView3 = import_react8.default.lazy(async () => Promise.resolve().then(() => (init_summary2(), summary_exports2)));
  return defineComponent({
    identifier: "processor.monetise",
    category: "output",
    name: "Monetise",
    subscription: {
      accepts: {
        type: "single-stream",
        media: Av
      },
      produces: {
        type: "single-stream",
        media: ["audio", "video", "ancillary"]
      }
    },
    extraValidation: (ctx) => {
      ctx.requireVideo(1);
      ctx.requireAudio(1);
    },
    display: (_desc) => {
      return {};
    },
    runtime: {
      initialState: () => ({}),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case "url-published":
            state.url = ev.url;
            break;
          case "advert-started":
            state.currentAdvert = { timeLeftMs: ev.durationMs };
            break;
          case "advert-tick":
            state.currentAdvert = { timeLeftMs: ev.timeLeftMs };
            break;
          case "advert-finished":
            state.currentAdvert = void 0;
            break;
          default:
            assertUnreachable3(evType);
        }
        return { ...state };
      },
      summary: SummaryView3
    },
    configForm: {
      global: {
        iceServers: (0, import_config2.GlobalIceServers)(R),
        hardware: (0, import_config2.HardwareSelection)()
      },
      form: {}
    }
  });
}
function assertUnreachable3(_) {
  throw new Error("Didn't expect to get here");
}

// build/info.js
var InitialisedComponents = {};
var initialised = false;
var AllComponents = [];
function getNodeInfo(r, type) {
  if (!initialised) {
    AllComponents.forEach((f) => {
      const i = f(r);
      InitialisedComponents[i.identifier] = i;
    });
    initialised = true;
  }
  return InitialisedComponents[type];
}
AllComponents.push((r) => info_default(r));
AllComponents.push((r) => info_default2(r));
AllComponents.push((r) => info_default3(r));
AllComponents.push((r) => info_default4(r));
export {
  getNodeInfo as default
};
