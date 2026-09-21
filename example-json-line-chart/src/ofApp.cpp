#include "ofApp.h"

void ofApp::setup() {
    ofSetWindowTitle("ofxECharts - JSON line chart example");
    ofSetFrameRate(60);
    ofSetVerticalSync(true);
    ofBackground(15, 18, 24);

    const auto output = ofToDataPathFS("web/data.json", true);
    if (!publisher.setup(output, 500)) {
        ofLogError("example") << publisher.getLastError();
    }

    sampleGeneratedData();
    updatePublisherDataset();
}

void ofApp::update() {
    const auto now = ofGetElapsedTimeMillis();
    if (now >= nextSampleAtMs) {
        sampleGeneratedData();
        updatePublisherDataset();
        nextSampleAtMs = now + 100;
    }

    publisher.update();
}

void ofApp::draw() {
    ofSetColor(236);
    ofDrawBitmapString("ofxECharts JSON publisher", 32, 42);

    ofSetColor(160);
    ofDrawBitmapString("OF writes one complete snapshot every 500 ms.", 32, 72);
    ofDrawBitmapString("Serve bin/data/web, then open http://127.0.0.1:8000/", 32, 94);
    ofDrawBitmapString("python3 -m http.server 8000 --bind 127.0.0.1 --directory bin/data/web", 32, 116);

    const float left = 32.0f;
    const float top = 164.0f;
    const float width = ofGetWidth() - 64.0f;
    const float height = 300.0f;

    ofNoFill();
    ofSetColor(50, 58, 72);
    ofDrawRectangle(left, top, width, height);

    if (history.size() > 1) {
        ofPolyline brightnessLine;
        ofPolyline movementLine;
        for (std::size_t index = 0; index < history.size(); ++index) {
            const float x = ofMap(index, 0, history.size() - 1, left, left + width);
            brightnessLine.addVertex(x, ofMap(history[index].brightness, 0, 1, top + height, top));
            movementLine.addVertex(x, ofMap(history[index].movement, 0, 1, top + height, top));
        }

        ofSetColor(82, 214, 188);
        brightnessLine.draw();
        ofSetColor(255, 174, 82);
        movementLine.draw();
    }

    ofFill();
    ofSetColor(82, 214, 188);
    ofDrawCircle(38, 500, 5);
    ofSetColor(205);
    ofDrawBitmapString("brightness", 52, 505);
    ofSetColor(255, 174, 82);
    ofDrawCircle(168, 500, 5);
    ofSetColor(205);
    ofDrawBitmapString("movement", 182, 505);

    ofSetColor(publisher.getLastError().empty() ? ofColor(125, 220, 160) : ofColor(255, 120, 110));
    const std::string status = publisher.getLastError().empty()
        ? "published sequence " + ofToString(publisher.getSequenceId())
            + " in " + ofToString(publisher.getLastPublishDurationMicros()) + " us"
        : publisher.getLastError();
    ofDrawBitmapString(status, 32, 552);

    ofSetColor(120);
    ofDrawBitmapString(publisher.getOutputPath().string(), 32, 582);
}

void ofApp::sampleGeneratedData() {
    const double time = ofGetElapsedTimef();
    const double brightness = ofMap(std::sin(time * 1.15), -1, 1, 0.08, 0.92, true);
    const double movement = ofClamp(
        ofNoise(static_cast<float>(time * 0.55)) * 0.82
            + std::abs(std::sin(time * 2.4)) * 0.18,
        0.0,
        1.0);

    history.push_back({time, brightness, movement});
    while (history.size() > maxSamples) {
        history.pop_front();
    }
}

void ofApp::updatePublisherDataset() {
    ofJson rows = ofJson::array();
    for (const auto & sample : history) {
        rows.push_back({sample.time, sample.brightness, sample.movement});
    }

    if (!publisher.setDataset({"time", "brightness", "movement"}, rows)) {
        ofLogError("example") << publisher.getLastError();
    }
}
