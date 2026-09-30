import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/production',fullyParallel:false,workers:1,timeout:90000,
  outputDir:'test-results/production',reporter:'list',
  use:{headless:true,screenshot:'only-on-failure',launchOptions:{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}
});
