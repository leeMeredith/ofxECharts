#pragma once

#include "ofMain.h"
#include "ofxECharts.h"

#include <deque>

class ofApp : public ofBaseApp {
public:
    void setup() override;
    void update() override;
    void draw() override;

private:
    struct Sample {
        double time = 0.0;
        double brightness = 0.0;
        double movement = 0.0;
    };

    void sampleGeneratedData();
    void updatePublisherDataset();

    ofxECharts publisher;
    std::deque<Sample> history;
    std::uint64_t nextSampleAtMs = 0;
    static constexpr std::size_t maxSamples = 200;
};
