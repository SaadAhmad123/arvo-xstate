import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter as GRPCTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import * as dotenv from 'dotenv';
dotenv.config();

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const createTelemetrySdk = () => {
  const telemetryResources = new Resource({
    [ATTR_SERVICE_NAME]: 'arvo-xstate',
  });
  if (process.env.EXPORTER_OTEL === 'JAEGER') {
    return new NodeSDK({
      resource: telemetryResources,
      traceExporter: new GRPCTraceExporter(),
      instrumentations: [getNodeAutoInstrumentations()],
    });
  }
  return new NodeSDK({
    resource: telemetryResources,
    traceExporter: new ConsoleSpanExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });
};

// Console Logger
export const telemetrySdk = createTelemetrySdk();

export const telemetrySdkStart = () => {
  if (process.env.ENABLE_OTEL === 'TRUE') {
    telemetrySdk.start();
  }
};

export const telemetrySdkStop = () => {
  try {
    telemetrySdk.shutdown();
  } catch {}
};
