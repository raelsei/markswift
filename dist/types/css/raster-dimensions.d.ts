/** Displayed dimensions from common raster headers; no image decoder dependency. */
export declare function rasterDimensions(bytes: Buffer): {
    w: number;
    h: number;
} | undefined;
