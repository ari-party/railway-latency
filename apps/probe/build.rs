use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

use typify::{ TypeSpace, TypeSpaceSettings };

fn main() {
  let schema_path = "schema/probe_sample.schema.json";
  let types_src = "../../packages/types/index.d.ts";

  println!("cargo:rerun-if-changed=build.rs");
  println!("cargo:rerun-if-changed={types_src}");

  if Path::new(types_src).exists() {
    let pnpm = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
    let status = Command::new(pnpm)
      .args(["--filter", "@railway-latency/types", "gen:schema"])
      .status()
      .expect("run `pnpm --filter @railway-latency/types gen:schema`");
    assert!(status.success(), "schema generation failed");
  }

  let content = fs
    ::read_to_string(schema_path)
    .expect("read probe sample schema");
  let schema = serde_json
    ::from_str::<schemars::schema::RootSchema>(&content)
    .expect("parse probe sample schema");

  let mut type_space = TypeSpace::new(
    TypeSpaceSettings::default().with_derive("PartialEq".to_string())
  );
  type_space.add_root_schema(schema).expect("add schema to type space");

  let generated = prettyplease::unparse(
    &syn::parse2::<syn::File>(type_space.to_stream()).unwrap()
  );

  let out = Path::new(&env::var("OUT_DIR").unwrap()).join("wire_types.rs");
  fs::write(out, generated).expect("write generated types");
}
