(() => {
  "use strict";

  const DEFAULT_SOURCE = "./data.json";
  const DEFAULT_POLL_MS = 500;
  const REQUEST_TIMEOUT_MS = 2000;
  const POLL_OPTIONS = new Set([0, 250, 500, 1000, 2000, 5000]);

  const axisStyle = {
    nameTextStyle: { color: "#7f8998" },
    axisLabel: { color: "#7f8998" },
    axisLine: { lineStyle: { color: "#364051" } },
    splitLine: { lineStyle: { color: "#222a36" } }
  };

  function latestSignalDataset(snapshot) {
    const { dimensions, source } = snapshot.dataset;
    const latestRow = source[source.length - 1];
    if (!latestRow) {
      return { dimensions: ["signal", "value"], source: [] };
    }

    const valueFor = (dimension) => {
      const value = latestRow[dimensions.indexOf(dimension)];
      return typeof value === "number" ? value : null;
    };

    return {
      dimensions: ["signal", "value"],
      source: [
        ["Brightness", valueFor("brightness")],
        ["Movement", valueFor("movement")]
      ]
    };
  }

  // Add another entry here to create another chart from the same snapshot.
  const chartConfigs = [
    {
      id: "signal-history",
      title: "Signal history",
      description: "Brightness and movement across the retained time window.",
      fileStem: "signal-history",
      requiredDimensions: ["time", "brightness", "movement"],
      buildOption(snapshot) {
        const series = [
          { name: "Brightness", dimension: "brightness", color: "#52d6bc" },
          { name: "Movement", dimension: "movement", color: "#ffae52" }
        ];

        return {
          animationDurationUpdate: 240,
          backgroundColor: "transparent",
          color: series.map((item) => item.color),
          dataset: snapshot.dataset,
          grid: { left: 62, right: 28, top: 58, bottom: 52 },
          legend: { top: 18, textStyle: { color: "#bac2d0" } },
          tooltip: { trigger: "axis" },
          xAxis: {
            type: "value",
            scale: true,
            min: "dataMin",
            max: "dataMax",
            name: "time",
            ...axisStyle,
            axisLabel: {
              color: "#7f8998",
              formatter: (value) => Number(value).toFixed(1).replace(/\.0$/, "")
            }
          },
          yAxis: {
            type: "value",
            min: 0,
            max: 1,
            ...axisStyle
          },
          series: series.map((item) => ({
            id: item.dimension,
            name: item.name,
            type: "line",
            showSymbol: false,
            encode: { x: "time", y: item.dimension },
            lineStyle: { width: 2 }
          }))
        };
      }
    },
    {
      id: "signal-relationship",
      title: "Signal relationship",
      description: "Each point compares brightness with movement from the same sample.",
      fileStem: "signal-relationship",
      requiredDimensions: ["brightness", "movement"],
      buildOption(snapshot) {
        return {
          animationDurationUpdate: 240,
          backgroundColor: "transparent",
          dataset: snapshot.dataset,
          grid: { left: 62, right: 28, top: 42, bottom: 58 },
          tooltip: { trigger: "item" },
          xAxis: {
            type: "value",
            min: 0,
            max: 1,
            name: "brightness",
            ...axisStyle
          },
          yAxis: {
            type: "value",
            min: 0,
            max: 1,
            name: "movement",
            ...axisStyle
          },
          series: [{
            id: "brightness-movement",
            name: "Samples",
            type: "scatter",
            symbolSize: 8,
            encode: {
              x: "brightness",
              y: "movement",
              tooltip: ["time", "brightness", "movement"]
            },
            itemStyle: {
              color: "#52d6bc",
              opacity: 0.68
            }
          }]
        };
      }
    },
    {
      id: "current-values",
      title: "Current values",
      description: "The latest brightness and movement values from the shared snapshot.",
      fileStem: "current-values",
      requiredDimensions: ["brightness", "movement"],
      buildOption(snapshot) {
        return {
          animationDurationUpdate: 240,
          backgroundColor: "transparent",
          dataset: latestSignalDataset(snapshot),
          grid: { left: 54, right: 24, top: 36, bottom: 52 },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          xAxis: {
            type: "category",
            axisLabel: { color: "#7f8998" },
            axisLine: { lineStyle: { color: "#364051" } },
            splitLine: { show: false }
          },
          yAxis: {
            type: "value",
            min: 0,
            max: 1,
            ...axisStyle
          },
          series: [{
            id: "current-signal-values",
            type: "bar",
            barMaxWidth: 92,
            encode: { x: "signal", y: "value" },
            itemStyle: {
              borderRadius: [7, 7, 0, 0],
              color: (params) => params.dataIndex === 0 ? "#52d6bc" : "#ffae52"
            },
            label: {
              show: true,
              position: "top",
              color: "#dfe5ef",
              formatter: (params) => {
                const value = params.value[1];
                return typeof value === "number" ? value.toFixed(2) : "—";
              }
            }
          }]
        };
      },
      buildUpdate(snapshot) {
        return { dataset: latestSignalDataset(snapshot) };
      }
    }
  ];

  const chartGrid = document.getElementById("charts");
  const connectionForm = document.getElementById("connection-form");
  const sourceInput = document.getElementById("source-input");
  const pollIntervalSelect = document.getElementById("poll-interval");
  const refreshNowButton = document.getElementById("refresh-now");
  const printButton = document.getElementById("print-dashboard");
  const statusText = document.getElementById("status");
  const statusDot = document.getElementById("status-dot");
  const sequenceText = document.getElementById("sequence");
  const publishedText = document.getElementById("published");
  const ageText = document.getElementById("age");
  const unseenText = document.getElementById("unseen");
  const activeSourceText = document.getElementById("active-source");
  const activeRateText = document.getElementById("active-rate");

  let activeSource = DEFAULT_SOURCE;
  let activePollMs = DEFAULT_POLL_MS;
  let latestSnapshot = null;
  let previousSequence = null;
  let unseenPublications = 0;
  let dimensionsKey = "";
  let pollTimer = null;
  let activeController = null;
  let requestGeneration = 0;
  let awaitingSource = false;
  let requestError = "";

  function createChartViews() {
    return chartConfigs.map((config) => {
      const card = document.createElement("article");
      card.className = "chart-card";
      card.dataset.chartId = config.id;

      const heading = document.createElement("div");
      heading.className = "chart-card-header";

      const text = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = config.title;
      const description = document.createElement("p");
      description.textContent = config.description;
      text.append(title, description);

      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.className = "export-button";
      exportButton.textContent = "Export PNG";
      exportButton.disabled = true;
      exportButton.setAttribute("aria-label", `Export ${config.title} as PNG`);

      const chartElement = document.createElement("div");
      chartElement.className = "chart";
      chartElement.id = config.id;
      chartElement.setAttribute("role", "img");
      chartElement.setAttribute("aria-label", config.description);

      heading.append(text, exportButton);
      card.append(heading, chartElement);
      chartGrid.append(card);

      const chart = echarts.init(chartElement, null, { renderer: "canvas" });
      const view = { config, chart, exportButton };
      exportButton.addEventListener("click", () => exportChart(view));
      return view;
    });
  }

  const chartViews = createChartViews();

  function setStatus(kind, message) {
    statusDot.className = `status-dot ${kind}`;
    statusText.textContent = message;
  }

  function normalizeSource(value) {
    const source = value.trim();
    if (!source) throw new Error("Enter a data source");

    const url = new URL(source, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Use an HTTP or HTTPS data source");
    }
    return source;
  }

  function parsePollMs(value, fallback = DEFAULT_POLL_MS) {
    const parsed = Number.parseInt(value, 10);
    return POLL_OPTIONS.has(parsed) ? parsed : fallback;
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Snapshot is not an object");
    if (!Number.isSafeInteger(snapshot.sequenceId) || snapshot.sequenceId < 1) throw new Error("Invalid sequenceId");
    if (Number.isNaN(Date.parse(snapshot.publishedAt))) throw new Error("Invalid publishedAt timestamp");
    if (!snapshot.dataset || !Array.isArray(snapshot.dataset.dimensions) || !Array.isArray(snapshot.dataset.source)) {
      throw new Error("Invalid dataset");
    }

    const { dimensions, source } = snapshot.dataset;
    if (dimensions.length === 0 || new Set(dimensions).size !== dimensions.length) {
      throw new Error("Dimensions must be non-empty and unique");
    }
    for (const row of source) {
      if (!Array.isArray(row) || row.length !== dimensions.length) throw new Error("Invalid dataset row");
    }

    const requiredDimensions = new Set(chartConfigs.flatMap((config) => config.requiredDimensions));
    for (const dimension of requiredDimensions) {
      if (!dimensions.includes(dimension)) throw new Error(`Missing dimension: ${dimension}`);
    }
  }

  function displaySnapshot(snapshot) {
    const nextDimensionsKey = JSON.stringify(snapshot.dataset.dimensions);
    for (const view of chartViews) {
      if (nextDimensionsKey !== dimensionsKey) {
        view.chart.setOption(view.config.buildOption(snapshot), { notMerge: true, lazyUpdate: true });
      } else {
        const update = view.config.buildUpdate
          ? view.config.buildUpdate(snapshot)
          : { dataset: snapshot.dataset };
        view.chart.setOption(update, { notMerge: false, lazyUpdate: true });
      }
      view.exportButton.disabled = false;
    }
    dimensionsKey = nextDimensionsKey;

    if (previousSequence !== null) {
      if (snapshot.sequenceId > previousSequence + 1) {
        unseenPublications += snapshot.sequenceId - previousSequence - 1;
      } else if (snapshot.sequenceId < previousSequence) {
        unseenPublications = 0;
      }
    }

    previousSequence = snapshot.sequenceId;
    latestSnapshot = snapshot;
    awaitingSource = false;
    requestError = "";
    sequenceText.textContent = String(snapshot.sequenceId);
    publishedText.textContent = new Date(snapshot.publishedAt).toLocaleTimeString();
    unseenText.textContent = String(unseenPublications);
    updateAge();
  }

  function updateAge() {
    if (!latestSnapshot) {
      ageText.textContent = "—";
      if (activePollMs === 0) setStatus("paused", "Polling paused");
      return;
    }

    const ageMs = Math.max(0, Date.now() - Date.parse(latestSnapshot.publishedAt));
    ageText.textContent = ageMs < 1000 ? `${ageMs} ms` : `${(ageMs / 1000).toFixed(1)} s`;

    if (activePollMs === 0) {
      setStatus("paused", "Polling paused");
    } else if (requestError) {
      setStatus("error", requestError);
    } else if (awaitingSource) {
      setStatus("waiting", "Connecting to source");
    } else if (ageMs > Math.max(2000, activePollMs * 2.5)) {
      setStatus("stale", "Data is stale");
    } else {
      setStatus("live", "Receiving data");
    }
  }

  function schedulePoll(delay = activePollMs, manual = false) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
    if (activePollMs === 0 && !manual) return;
    pollTimer = window.setTimeout(() => poll(manual), delay);
  }

  async function poll(manual = false) {
    if (activeController || (activePollMs === 0 && !manual)) return;

    const generation = requestGeneration;
    const controller = new AbortController();
    activeController = controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(activeSource, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const snapshot = await response.json();
      validateSnapshot(snapshot);
      if (generation !== requestGeneration) return;

      if (!latestSnapshot || snapshot.sequenceId !== latestSnapshot.sequenceId || awaitingSource) {
        displaySnapshot(snapshot);
      } else {
        updateAge();
      }
    } catch (error) {
      if (generation !== requestGeneration) return;
      if (error.name === "AbortError") {
        requestError = "Request timed out";
        setStatus("error", requestError);
      } else if (!latestSnapshot) {
        requestError = "";
        setStatus("waiting", "Waiting for data");
      } else {
        requestError = "Data unavailable";
        setStatus("error", requestError);
      }
    } finally {
      window.clearTimeout(timeout);
      if (activeController === controller) activeController = null;
      if (generation === requestGeneration && activePollMs > 0) schedulePoll(activePollMs);
    }
  }

  function intervalLabel(pollMs) {
    if (pollMs === 0) return "with automatic refresh paused";
    if (pollMs < 1000) return `every ${pollMs} ms`;
    const seconds = pollMs / 1000;
    return `every ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  }

  function syncControlsAndAddress() {
    sourceInput.value = activeSource;
    pollIntervalSelect.value = String(activePollMs);
    activeSourceText.textContent = activeSource;
    activeRateText.textContent = intervalLabel(activePollMs);

    const params = new URLSearchParams(window.location.search);
    if (activeSource === DEFAULT_SOURCE) params.delete("source");
    else params.set("source", activeSource);
    if (activePollMs === DEFAULT_POLL_MS) params.delete("poll");
    else params.set("poll", String(activePollMs));

    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    try {
      window.history.replaceState(null, "", nextUrl);
    } catch {
      // The dashboard still works when the browser does not permit URL replacement.
    }
  }

  function applyControls() {
    let nextSource;
    try {
      nextSource = normalizeSource(sourceInput.value);
    } catch (error) {
      setStatus("error", error.message);
      sourceInput.focus();
      return;
    }

    const nextPollMs = parsePollMs(pollIntervalSelect.value);
    const sourceChanged = nextSource !== activeSource;

    activeSource = nextSource;
    activePollMs = nextPollMs;
    requestGeneration += 1;
    requestError = "";
    window.clearTimeout(pollTimer);
    pollTimer = null;
    if (activeController) activeController.abort();
    activeController = null;

    if (sourceChanged) {
      previousSequence = null;
      unseenPublications = 0;
      unseenText.textContent = "0";
      dimensionsKey = "";
      awaitingSource = true;
      setStatus("waiting", "Connecting to source");
    }

    syncControlsAndAddress();
    if (activePollMs === 0) {
      updateAge();
    } else {
      schedulePoll(0);
    }
  }

  function exportChart(view) {
    if (!latestSnapshot) return;

    const imageUrl = view.chart.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#0f1218"
    });
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `${view.config.fileStem}-sequence-${latestSnapshot.sequenceId}.png`;
    link.click();
  }

  function resizeCharts() {
    for (const view of chartViews) view.chart.resize();
  }

  connectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyControls();
  });

  refreshNowButton.addEventListener("click", () => {
    if (!activeController) schedulePoll(0, true);
  });

  printButton.addEventListener("click", () => window.print());
  window.addEventListener("resize", resizeCharts);
  window.addEventListener("beforeprint", resizeCharts);
  window.addEventListener("afterprint", resizeCharts);
  window.setInterval(updateAge, 250);

  const initialParams = new URLSearchParams(window.location.search);
  const sourceParam = initialParams.get("source");
  if (sourceParam) {
    try {
      activeSource = normalizeSource(sourceParam);
    } catch {
      activeSource = DEFAULT_SOURCE;
    }
  }
  activePollMs = parsePollMs(initialParams.get("poll"), DEFAULT_POLL_MS);
  syncControlsAndAddress();
  if (activePollMs === 0) updateAge();
  else schedulePoll(0);
})();
