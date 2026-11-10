/** Browser-only visual profiling. Captures samples when the Narrador explicitly starts
 * a benchmark. Not an FPS estimate and not a simulation of a live battle.
 */
export type MiniaturePerfSample=Readonly<{
 fps:number;elapsedMs:number;frames:number;tokenCount:number;
 averageDrawCalls:number;averageTriangles:number;
}>;
export function buildMiniaturePerfSample(data:{
 elapsedMs:number;frames:number;tokenCount:number;
 totalDrawCalls:number;totalTriangles:number;
}):MiniaturePerfSample|null{
 const {elapsedMs,frames,tokenCount,totalDrawCalls,totalTriangles}=data;
 if(!Number.isFinite(elapsedMs)||elapsedMs<=0||!Number.isFinite(frames)||frames<2)return null;
 return {
  fps:Math.round(frames/elapsedMs*100000)/100,
  elapsedMs:Math.round(elapsedMs),frames,tokenCount,
  averageDrawCalls:Math.round(totalDrawCalls/frames),
  averageTriangles:Math.round(totalTriangles/frames),
 };
}
