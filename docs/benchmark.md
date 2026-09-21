# 200-row publication benchmark

This benchmark measures the work performed inside the openFrameworks process. It answers three separate questions:

- How long does one complete JSON publication occupy the OF update thread?
- How much CPU does validation, copying, serialization, writing, and replacement consume at the example's normal schedule?
- Does that work disturb a 60 FPS application at the documented 200-row workload?

## Environment

- MacBook Air with Apple M4, 10 CPU cores, and 16 GB memory
- macOS 26.7
- openFrameworks 0.12.1
- Apple clang 21.0.0
- 200 rows and 3 dimensions
- Final JSON snapshot size: 11,844 bytes
- Dataset rebuilt and passed to `setDataset()` every 100 ms
- Snapshot published every 500 ms
- Application limited to 60 FPS with VSync enabled

Both Release and Debug builds used the same workload. Ten publications were discarded as warm-up, followed by 100 measured publications. Temporary instrumentation timed calls with `ofGetElapsedTimeMicros()` and measured process CPU time with `std::clock()`. The instrumentation was removed after the run.

`publish_wall_us` covers snapshot construction, JSON serialization, temporary-file writing and flush, close, and atomic replacement. `set_dataset_wall_us` covers dimension and row validation plus the add-on's dataset copy. `prepare_rows_and_set_wall_us` also includes the example's construction of the 200 JSON rows, which is application work rather than add-on work.

## Release results

| Measurement | Mean | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Complete publication wall time | 0.457 ms | 0.433 ms | 0.629 ms | 1.099 ms |
| Complete publication CPU time | 0.463 ms | 0.446 ms | 0.618 ms | 1.122 ms |
| `setDataset()` wall time | 0.022 ms | 0.022 ms | 0.038 ms | 0.088 ms |
| Build rows and call `setDataset()` | 0.038 ms | 0.037 ms | 0.066 ms | 0.128 ms |
| Idle `publisher.update()` wall time | 0.003 ms | 0.004 ms | 0.005 ms | 0.020 ms |
| Frame containing publication | 16.805 ms | 16.666 ms | 17.531 ms | 17.779 ms |

The application reported 60.003 FPS. A 0.629 ms 95th percentile publication consumes 3.8% of a 16.67 ms frame budget, and publication occurs on two frames per second.

At the example schedule, the measured work estimates to about 0.13% of one CPU core for add-on calls. Including the example's JSON-row construction raises the estimate to about 0.15% of one core.

## Debug results

| Measurement | Mean | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Complete publication wall time | 0.926 ms | 0.863 ms | 1.237 ms | 3.665 ms |
| Complete publication CPU time | 0.909 ms | 0.905 ms | 1.245 ms | 1.427 ms |
| `setDataset()` wall time | 0.235 ms | 0.253 ms | 0.289 ms | 0.486 ms |
| Build rows and call `setDataset()` | 0.350 ms | 0.374 ms | 0.454 ms | 0.632 ms |
| Idle `publisher.update()` wall time | 0.004 ms | 0.004 ms | 0.009 ms | 0.030 ms |
| Frame containing publication | 16.866 ms | 16.666 ms | 16.672 ms | 36.514 ms |

The application reported 60.002 FPS. The isolated 36.514 ms frame coincided with a publisher CPU maximum of only 1.427 ms and was not representative of the distribution; the publication-frame 95th percentile remained 16.672 ms.

At the example schedule, the measured work estimates to about 0.44% of one CPU core for add-on calls. Including the example's JSON-row construction raises the estimate to about 0.55% of one core.

## CPU estimate

The estimate applies the measured mean CPU times to the example's schedule:

```text
2 publications/second
+ 10 setDataset() calls/second
+ 58 idle publisher.update() calls/second
```

The result is incremental CPU work attributable to the data bridge, expressed as a percentage of one core. It is not the total CPU use of the OF application. Drawing, other application logic, the Python static server, the browser, and ECharts rendering are separate.

## Interpreting the result

At this workload, a user should expect no sustained frame-rate reduction on comparable hardware. Publication briefly adds about 0.46 ms in Release or 0.93 ms in Debug to two update frames each second. An application already using almost all of its frame budget has less room for that burst and may need a slower publication interval.

The browser refresh interval does not change the OF publication schedule. More browser charts reuse the same snapshot and do not increase the C++ work. Browser rendering and more frequent polling can increase browser and static-server CPU use without increasing the measured OF cost.

Validation, copying, and serialization scale with the number and size of cells. Average publication CPU and disk activity also scale approximately with publication frequency: changing from 500 ms to 250 ms performs about twice as many publications. Measure again for substantially larger datasets, slower storage, network-mounted output paths, or applications with very little remaining frame time.
