import SparkMD5 from "spark-md5";
import { LIMITS, type Part, type Transfer } from "../shared/contracts";
import { api, ApiError, post } from "./api";
function put(
  url: string,
  headers: Record<string, string>,
  blob: Blob,
  signal: AbortSignal,
  progress: (n: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => {
      reject(new DOMException("Envio pausado.", "AbortError"));
      xhr.abort();
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers))
      xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (e) => progress(e.loaded);
    xhr.timeout = 120_000;
    const fail = () =>
      reject(
        new Error("A conexão foi interrompida. Você pode retomar o envio."),
      );
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new ApiError(
            "Não foi possível enviar esta parte.",
            xhr.status,
            "UPLOAD_FAILED",
          ),
        );
    };
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    xhr.send(blob);
  });
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Envio pausado.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export async function uploadTransfer(
  transfer: Transfer,
  originals: File[],
  signal: AbortSignal,
  onProgress: (sent: number) => void,
) {
  let previous = 0;
  for (const file of transfer.files) {
    signal.throwIfAborted();
    if (file.status === "complete") {
      previous += file.size;
      onProgress(previous);
      continue;
    }
    const original = originals.find(
      (f) =>
        f.name === file.name &&
        f.size === file.size &&
        f.lastModified === file.last_modified,
    );
    if (!original)
      throw new Error(`Selecione o arquivo original: ${file.name}.`);
    await post(`/files/${file.id}/start`, {}, { signal });
    signal.throwIfAborted();
    const state = await api<{ complete: boolean; parts: Part[] }>(
      `/files/${file.id}/parts`,
      { signal },
    );
    if (state.complete) {
      previous += file.size;
      onProgress(previous);
      continue;
    }
    const progress = new Map<number, number>();
    const report = () =>
      onProgress(previous + [...progress.values()].reduce((a, b) => a + b, 0));
    const count = Math.ceil(file.size / LIMITS.part);
    let cursor = 1;
    async function worker() {
      while (cursor <= count) {
        signal.throwIfAborted();
        const number = cursor++,
          blob = original!.slice(
            (number - 1) * LIMITS.part,
            number * LIMITS.part,
          );
        const md5 = SparkMD5.ArrayBuffer.hash(await blob.arrayBuffer());
        signal.throwIfAborted();
        const existing = state.parts.find((p) => p.number === number);
        if (existing) {
          if (
            existing.size !== blob.size ||
            existing.etag.replaceAll('"', "").toLowerCase() !== md5
          )
            throw new Error(
              "O arquivo selecionado mudou. Use o original ou cancele este envio.",
            );
          progress.set(number, blob.size);
          report();
          continue;
        }
        const digest = btoa(
          String.fromCharCode(
            ...Uint8Array.from(md5.match(/../g)!, (n) => parseInt(n, 16)),
          ),
        );
        for (let attempt = 0; attempt < 3; attempt++) {
          signal.throwIfAborted();
          try {
            const signed = await post<{
              url: string;
              headers: Record<string, string>;
            }>(
              `/files/${file.id}/authorize`,
              { number, md5: digest },
              { signal },
            );
            signal.throwIfAborted();
            await put(signed.url, signed.headers, blob, signal, (n) => {
              progress.set(number, n);
              report();
            });
            progress.set(number, blob.size);
            report();
            break;
          } catch (e) {
            if (
              signal.aborted ||
              attempt === 2 ||
              (e instanceof ApiError &&
                e.status < 500 &&
                ![408, 409, 429].includes(e.status))
            )
              throw e;
            progress.delete(number);
            report();
            await delay(500 * 2 ** attempt, signal);
          }
        }
      }
    }
    // Wait for both lanes to settle before exposing pause/cancel actions to the next run.
    const outcomes = await Promise.allSettled([worker(), worker()]);
    const failed = outcomes.find((x) => x.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    signal.throwIfAborted();
    for (let attempt = 0; ; attempt++) {
      try {
        await post(`/files/${file.id}/finish`, {}, { signal });
        break;
      } catch (error) {
        // A provider may complete the object before a verification request
        // fails. Retrying this idempotent endpoint reconciles it via HEAD.
        if (
          signal.aborted ||
          attempt >= 2 ||
          (error instanceof ApiError &&
            error.status < 500 &&
            ![408, 429].includes(error.status) &&
            error.code !== "FILE_BUSY")
        )
          throw error;
        await delay(500 * 2 ** attempt, signal);
      }
    }
    previous += file.size;
    onProgress(previous);
  }
  signal.throwIfAborted();
  return post<Transfer>(`/transfers/${transfer.id}/finish`, {}, { signal });
}
