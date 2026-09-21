#pragma once

#include "ofMain.h"

#include <cstdint>
#include <string>
#include <vector>

// Publishes one complete ECharts-compatible JSON snapshot at a fixed interval.
// It does not run a server or configure a chart. See example-json-line-chart.
class ofxECharts {
public:
    bool setup(const of::filesystem::path & outputFile,
               std::uint64_t publishIntervalMs = 500);

    // source must be an array of rows. Every row must have one value per
    // dimension. Values may be strings, booleans, finite numbers, or null.
    bool setDataset(const std::vector<std::string> & dimensions,
                    const ofJson & source);

    // Call once per OF update. Publication and any deferred replacement retry
    // happen here; this method never sleeps.
    void update();

    // Request a publication immediately. A transient replacement failure may
    // still be completed by later update() calls.
    bool publishNow();

    bool isReady() const { return configured && datasetReady; }
    bool hasPendingRetry() const { return replacementPending; }
    std::uint64_t getSequenceId() const { return sequenceId; }
    std::uint64_t getLastPublishDurationMicros() const { return lastPublishDurationMicros; }
    const std::string & getLastError() const { return lastError; }
    const of::filesystem::path & getOutputPath() const { return outputPath; }

private:
    enum class ReplaceResult {
        success,
        retryableFailure,
        fatalFailure
    };

    bool validateDataset(const std::vector<std::string> & dimensions,
                         const ofJson & source,
                         std::string & error) const;
    bool writeCandidateSnapshot();
    bool attemptReplacement();
    ReplaceResult replaceTemporaryFile(std::string & error) const;
    void scheduleReplacementRetry(const std::string & error);
    void failReplacement(const std::string & error);
    std::string utcTimestamp() const;

    of::filesystem::path outputPath;
    of::filesystem::path temporaryPath;
    std::uint64_t intervalMs = 500;
    std::uint64_t nextPublishAtMs = 0;
    std::uint64_t nextRetryAtMs = 0;
    std::uint64_t sequenceId = 0;
    std::uint64_t pendingSequenceId = 0;
    std::uint64_t publishStartedAtMicros = 0;
    std::uint64_t lastPublishDurationMicros = 0;
    int retryCount = 0;
    bool configured = false;
    bool datasetReady = false;
    bool replacementPending = false;
    ofJson dataset;
    std::string lastError;
};
