#include "ofxECharts.h"

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <set>
#include <sstream>

#ifdef TARGET_WIN32
#include <windows.h>
#endif

namespace {
constexpr int kMaxReplacementAttempts = 3;
constexpr std::uint64_t kRetryDelayMs = 10;
}

bool ofxECharts::setup(const of::filesystem::path & outputFile,
                       std::uint64_t publishIntervalMs) {
    configured = false;
    replacementPending = false;
    datasetReady = false;
    sequenceId = 0;
    pendingSequenceId = 0;
    retryCount = 0;

    if (outputFile.empty()) {
        lastError = "Output file path is empty.";
        return false;
    }

    outputPath = outputFile.is_absolute()
        ? outputFile
        : ofToDataPathFS(outputFile, true);
    temporaryPath = outputPath;
    temporaryPath += ".tmp";

    ofDirectory parent(outputPath.parent_path());
    if (!parent.exists() && !parent.create(true)) {
        lastError = "Could not create output directory: " + outputPath.parent_path().string();
        return false;
    }

    intervalMs = std::max<std::uint64_t>(1, publishIntervalMs);
    nextPublishAtMs = ofGetElapsedTimeMillis();
    configured = true;
    lastError.clear();
    return true;
}

bool ofxECharts::setDataset(const std::vector<std::string> & dimensions,
                            const ofJson & source) {
    std::string error;
    if (!validateDataset(dimensions, source, error)) {
        lastError = error;
        return false;
    }

    dataset = {
        {"dimensions", dimensions},
        {"source", source}
    };
    datasetReady = true;
    return true;
}

void ofxECharts::update() {
    if (!configured) {
        return;
    }

    const auto now = ofGetElapsedTimeMillis();

    if (replacementPending) {
        if (now >= nextRetryAtMs) {
            attemptReplacement();
        }
        return;
    }

    if (datasetReady && now >= nextPublishAtMs) {
        publishNow();
        nextPublishAtMs = now + intervalMs;
    }
}

bool ofxECharts::publishNow() {
    if (!configured) {
        lastError = "Call setup() before publishing.";
        return false;
    }
    if (!datasetReady) {
        lastError = "Set a valid dataset before publishing.";
        return false;
    }
    if (replacementPending) {
        return false;
    }

    publishStartedAtMicros = ofGetElapsedTimeMicros();
    pendingSequenceId = sequenceId + 1;
    retryCount = 0;

    if (!writeCandidateSnapshot()) {
        return false;
    }

    replacementPending = true;
    return attemptReplacement();
}

bool ofxECharts::validateDataset(const std::vector<std::string> & dimensions,
                                 const ofJson & source,
                                 std::string & error) const {
    if (dimensions.empty()) {
        error = "Dataset must contain at least one dimension.";
        return false;
    }

    std::set<std::string> names;
    for (const auto & dimension : dimensions) {
        if (dimension.empty()) {
            error = "Dimension names cannot be empty.";
            return false;
        }
        if (!names.insert(dimension).second) {
            error = "Dimension names must be unique: " + dimension;
            return false;
        }
    }

    if (!source.is_array()) {
        error = "Dataset source must be an array of rows.";
        return false;
    }

    for (std::size_t rowIndex = 0; rowIndex < source.size(); ++rowIndex) {
        const auto & row = source[rowIndex];
        if (!row.is_array() || row.size() != dimensions.size()) {
            error = "Row " + ofToString(rowIndex) + " must contain "
                + ofToString(dimensions.size()) + " values.";
            return false;
        }

        for (std::size_t columnIndex = 0; columnIndex < row.size(); ++columnIndex) {
            const auto & value = row[columnIndex];
            const bool supported = value.is_null()
                || value.is_string()
                || value.is_boolean()
                || value.is_number();
            if (!supported) {
                error = "Dataset cells must be scalar values or null.";
                return false;
            }
            if (value.is_number_float() && !std::isfinite(value.get<double>())) {
                error = "Dataset numbers must be finite; use null for missing readings.";
                return false;
            }
        }
    }

    return true;
}

bool ofxECharts::writeCandidateSnapshot() {
    const ofJson snapshot = {
        {"publishedAt", utcTimestamp()},
        {"sequenceId", pendingSequenceId},
        {"dataset", dataset}
    };

    std::ofstream stream(temporaryPath.string(), std::ios::binary | std::ios::trunc);
    if (!stream.is_open()) {
        lastError = "Could not open temporary snapshot: " + temporaryPath.string();
        return false;
    }

    try {
        stream << snapshot.dump();
        stream.flush();
    } catch (const std::exception & exception) {
        lastError = std::string("Could not serialize snapshot: ") + exception.what();
        return false;
    }

    if (!stream.good()) {
        lastError = "Could not finish writing temporary snapshot: " + temporaryPath.string();
        return false;
    }
    stream.close();
    return true;
}

bool ofxECharts::attemptReplacement() {
    std::string error;
    const auto result = replaceTemporaryFile(error);

    if (result == ReplaceResult::success) {
        replacementPending = false;
        sequenceId = pendingSequenceId;
        retryCount = 0;
        lastPublishDurationMicros = ofGetElapsedTimeMicros() - publishStartedAtMicros;
        lastError.clear();
        return true;
    }

    if (result == ReplaceResult::retryableFailure
        && retryCount + 1 < kMaxReplacementAttempts) {
        scheduleReplacementRetry(error);
        return false;
    }

    failReplacement(error);
    return false;
}

void ofxECharts::scheduleReplacementRetry(const std::string & error) {
    ++retryCount;
    nextRetryAtMs = ofGetElapsedTimeMillis() + kRetryDelayMs;
    lastError = error + " Retrying replacement on a later OF update.";
}

void ofxECharts::failReplacement(const std::string & error) {
    replacementPending = false;
    retryCount = 0;
    lastError = error;
    ofLogError("ofxECharts") << lastError;
}

ofxECharts::ReplaceResult ofxECharts::replaceTemporaryFile(std::string & error) const {
#ifdef TARGET_WIN32
    const std::wstring source = temporaryPath.wstring();
    const std::wstring destination = outputPath.wstring();
    const DWORD flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;

    if (MoveFileExW(source.c_str(), destination.c_str(), flags) != 0) {
        return ReplaceResult::success;
    }

    const DWORD code = GetLastError();
    error = "Could not replace snapshot (Windows error " + ofToString(code) + ").";
    if (code == ERROR_SHARING_VIOLATION
        || code == ERROR_LOCK_VIOLATION
        || code == ERROR_ACCESS_DENIED) {
        return ReplaceResult::retryableFailure;
    }
    return ReplaceResult::fatalFailure;
#else
    if (std::rename(temporaryPath.string().c_str(), outputPath.string().c_str()) == 0) {
        return ReplaceResult::success;
    }

    const int code = errno;
    error = "Could not replace snapshot: " + std::string(std::strerror(code)) + ".";
    if (code == EACCES || code == EBUSY || code == ETXTBSY) {
        return ReplaceResult::retryableFailure;
    }
    return ReplaceResult::fatalFailure;
#endif
}

std::string ofxECharts::utcTimestamp() const {
    const auto now = std::chrono::system_clock::now();
    const auto elapsed = now.time_since_epoch();
    const auto milliseconds = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed) % 1000;
    const std::time_t nowTime = std::chrono::system_clock::to_time_t(now);
    std::tm utc{};

#ifdef TARGET_WIN32
    gmtime_s(&utc, &nowTime);
#else
    gmtime_r(&nowTime, &utc);
#endif

    std::ostringstream timestamp;
    timestamp << std::put_time(&utc, "%Y-%m-%dT%H:%M:%S")
              << '.' << std::setw(3) << std::setfill('0') << milliseconds.count()
              << 'Z';
    return timestamp.str();
}
