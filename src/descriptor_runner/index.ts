import { Backend } from "./interface/core/constants";
import * as Image from "./image";
import * as Math from "./math";
export { Image, Math };
import { WebDNNLogging } from "./logging";
export { WebDNNLogging as Logging };
import { BackendContexts, RunnerImpl } from "./core/runnerImpl";
import { WebDNNCPUContextImpl } from "./backend/cpu/cpuContextImpl";
import { WebDNNWebGLContextImpl } from "./backend/webgl/webglContextImpl";
import { WebDNNWasmContextImpl } from "./backend/wasm/wasmContextImpl";
import { WebDNNWebGPUContextImpl } from "./backend/webgpu/webgpuContextImpl";
import { wasmWorkerSrcUrl } from "./operators/wasm/worker/worker";
import { registerOperators } from "./core/operatorTable";
import { getOpEntries as getOpEntriesCPU } from "./operators/cpu/opEntriesStandard";
import { getOpEntries as getOpEntriesWasm } from "./operators/wasm/opEntriesStandard";
import { getOpEntries as getOpEntriesWebGL } from "./operators/webgl/opEntriesStandard";
import { getOpEntries as getOpEntriesWebGPU } from "./operators/webgpu/opEntriesStandard";
import { Runner } from "./interface/core/runner";
import { WebDNNWebGLContextOption } from "./interface/backend/webgl/webglContext";
import { WebDNNWebGPUContextOption } from "./interface/backend/webgpu/webgpuContext";
export { CPUTensorImpl as CPUTensor } from "./backend/cpu/cpuTensorImpl";

export interface InitOption {
  backendOrder?: Backend[];
  optimized?: boolean;
  backendOptions?: {
    wasm?: WebDNNWebGLContextOption;
    webgl?: WebDNNWebGLContextOption;
    webgpu?: WebDNNWebGPUContextOption;
  };
  progressCallback?: (loaded: number, total: number) => unknown;
}

const defaultContexts = {
  cpu: null as WebDNNCPUContextImpl | null,
  wasm: null as WebDNNWasmContextImpl | null,
  webgl: null as WebDNNWebGLContextImpl | null,
  webgpu: null as WebDNNWebGPUContextImpl | null,
};

export async function load(
  directory: string,
  options: InitOption = {},
  onnxBasename: string = "model.onnx"
): Promise<Runner> {
  const { backendOrder = ["webgl", "wasm", "cpu"], optimized } = options;
  if (optimized) {
    throw new Error(
      "Currently, webdnn.js does not support optimized model. Use webdnn-core.js instead."
    );
  }
  if (!defaultContexts.cpu) {
    defaultContexts.cpu = new WebDNNCPUContextImpl();
    await defaultContexts.cpu.initialize();
    registerOperators(getOpEntriesCPU());
  }
  const cpuContext: WebDNNCPUContextImpl = defaultContexts.cpu,
    backendContexts: BackendContexts = { cpu: cpuContext };
  let succeedBackend: Backend | null = null;
  for (const tryBackend of backendOrder) {
    switch (tryBackend) {
      case "cpu":
        succeedBackend = "cpu";
        break;
      case "wasm":
        {
          if (!defaultContexts.wasm) {
            try {
              const ctx = new WebDNNWasmContextImpl(
                cpuContext,
                options.backendOptions?.wasm || {}
              );
              await ctx.initialize(wasmWorkerSrcUrl);
              defaultContexts.wasm = ctx;
              registerOperators(getOpEntriesWasm());
              succeedBackend = "wasm";
              backendContexts.wasm = defaultContexts.wasm;
              // eslint-disable-next-line no-empty
            } catch {}
          } else {
            succeedBackend = "wasm";
            backendContexts.wasm = defaultContexts.wasm;
          }
        }
        break;
      case "webgl":
        {
          if (!defaultContexts.webgl) {
            try {
              const ctx = new WebDNNWebGLContextImpl(
                cpuContext,
                options.backendOptions?.webgl || {}
              );
              await ctx.initialize();
              defaultContexts.webgl = ctx;
              registerOperators(getOpEntriesWebGL());
              succeedBackend = "webgl";
              backendContexts.webgl = defaultContexts.webgl;
              // eslint-disable-next-line no-empty
            } catch {}
          } else {
            succeedBackend = "webgl";
            backendContexts.webgl = defaultContexts.webgl;
          }
        }
        break;

      case "webgpu":
        {
          if (!defaultContexts.webgpu) {
            try {
              const ctx = new WebDNNWebGPUContextImpl(
                cpuContext,
                options.backendOptions?.webgpu || {}
              );
              await ctx.initialize();
              defaultContexts.webgpu = ctx;
              registerOperators(getOpEntriesWebGPU());
              succeedBackend = "webgpu";
              backendContexts.webgpu = defaultContexts.webgpu;
              // eslint-disable-next-line no-empty
            } catch {}
          } else {
            succeedBackend = "webgpu";
            backendContexts.webgpu = defaultContexts.webgpu;
          }
        }
        break;
      default:
        throw new Error(`Unknown backend ${tryBackend}`);
    }

    if (succeedBackend) {
      break;
    }
  }
  if (!succeedBackend) {
    throw new Error("No backend available");
  }
  const actualBackendOrder: Backend[] =
      succeedBackend === "cpu" ? ["cpu"] : [succeedBackend, "cpu"],
    runner = new RunnerImpl(actualBackendOrder, backendContexts);
  await runner.loadModel(directory, onnxBasename, options.progressCallback);
  return runner;
}
