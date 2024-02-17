import { DenonConfig } from "https://deno.land/x/denon@2.5.0/mod.ts";

const config: DenonConfig = {
    scripts: {
        start: {
            cmd: "deno run src/app.ts",
            desc: "run my app.ts file",
            allow: ["net"],
            unstable: true,
        },
    },
};

export default config;
