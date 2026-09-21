(() => {
  "use strict";

  const POLL_MS = 500;
  const REQUEST_TIMEOUT_MS = 2000;
  const STALE_AFTER_MS = 2000;

  // This first example deliberately keeps chart choices in JavaScript.
  const chartConfig = {
    x: "time",
    series: [
      { name: "Brightness", dimension: "brightness", color: "#52d6bc" },
      { name: "Movement", dimension: "movement", color: "#ffae52" }
    ]
  };

  const chart = echarts.init(document.getElementById("chart"), null, { renderer: "canvas" });
  const statusText = document.getElementById("status");
  const statusDot = document.getElementById("status-dot");
  const sequenceText = document.getElementById("sequence");
  const publishedText = document.getElementById("published");
  const ageText = document.getElementById("age");
  const unseenText = document.getElementById("unseen");

  let latestSnapshot = null;
  let previousSequence = null;
  let unseenPublications = 0;
  let dimensionsKey = "";

  function setStatus(kind, message) {
    statusDot.className = `status-dot ${kind}`;
    statusText.textContent = message;
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
    if (!dimensions.includes(chartConfig.x)) throw new Error(`Missing x dimension: ${chartConfig.x}`);
    for (const series of chartConfig.series) {
      if (!dimensions.includes(series.dimension)) throw new Error(`Missing series dimension: ${series.dimension}`);
    }
  }

  function baseOption(snapshot) {
    return {
      animationDurationUpdate: 240,
      backgroundColor: "transparent",
      color: chartConfig.series.map((series) => series.color),
      dataset: snapshot.dataset,
      grid: { left: 62, right: 28, top: 58, bottom: 52 },
      legend: { top: 18, textStyle: { color: "#bac2d0" } },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "value",
        name: chartConfig.x,
        nameTextStyle: { color: "#7f8998" },
        axisLabel: { color: "#7f8998" },
        axisLine: { lineStyle: { color: "#364051" } },
        splitLine: { lineStyle: { color: "#222a36" } }
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: { color: "#7f8998" },
        axisLine: { lineStyle: { color: "#364051" } },
        splitLine: { lineStyle: { color: "#222a36" } }
      },
      series: chartConfig.series.map((series) => ({
        id: series.dimension,
        name: series.name,
        type: "line",
        showSymbol: false,
        encode: { x: chartConfig.x, y: series.dimension },
        lineStyle: { width: 2 }
      }))
    };
  }

  function displaySnapshot(snapshot) {
    const nextDimensionsKey = JSON.stringify(snapshot.dataset.dimensions);
    if (nextDimensionsKey !== dimensionsKey) {
      chart.setOption(baseOption(snapshot), { notMerge: true, lazyUpdate: true });
      dimensionsKey = nextDimensionsKey;
    } else {
      chart.setOption({ dataset: snapshot.dataset }, { notMerge: false, lazyUpdate: true });
    }

    if (previousSequence !== null) {
      if (snapshot.sequenceId > previousSequence + 1) {
        unseenPublications += snapshot.sequenceId - previousSequence - 1;
      } else if (snapshot.sequenceId < previousSequence) {
        unseenPublications = 0;
      }
    }

    previousSequence = snapshot.sequenceId;
    latestSnapshot = snapshot;
    sequenceText.textContent = String(snapshot.sequenceId);
    publishedText.textContent = new Date(snapshot.publishedAt).toLocaleTimeString();
    unseenText.textContent = String(unseenPublications);
    updateAge();
  }

  function updateAge() {
    if (!latestSnapshot) {
      ageText.textContent = "—";
      return;
    }

    const ageMs = Math.max(0, Date.now() - Date.parse(latestSnapshot.publishedAt));
    ageText.textContent = ageMs < 1000 ? `${ageMs} ms` : `${(ageMs / 1000).toFixed(1)} s`;
    if (ageMs > STALE_AFTER_MS) {
      setStatus("stale", "Data is stale");
    } else {
      setStatus("live", "Receiving data");
    }
  }

  async function poll() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("./data.json", {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const snapshot = await response.json();
      validateSnapshot(snapshot);

      if (!latestSnapshot || snapshot.sequenceId !== latestSnapshot.sequenceId) {
        displaySnapshot(snapshot);
      } else {
        updateAge();
      }
    } catch (error) {
      if (!latestSnapshot) {
        setStatus("waiting", "Waiting for data");
      } else {
        setStatus("error", error.name === "AbortError" ? "Request timed out" : "Data unavailable");
      }
    } finally {
      window.clearTimeout(timeout);
      window.setTimeout(poll, POLL_MS);
    }
  }

  window.addEventListener("resize", () => chart.resize());
  window.setInterval(updateAge, 250);
  poll();
})();
