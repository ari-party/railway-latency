use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

use typify::{ TypeSpace, TypeSpaceSettings };

const SCHEMAS: &[&str] = &[
  "schema/probe_sample.schema.json",
  "schema/error_event.schema.json",
  "schema/check_event.schema.json",
];

fn main() {
  let types_barrel = "../../packages/types/index.d.ts";
  let types_src = "../../packages/types/wire.d.ts";
  let types_check = "../../packages/types/check.d.ts";

  println!("cargo:rerun-if-changed=build.rs");
  println!("cargo:rerun-if-changed={types_barrel}");
  println!("cargo:rerun-if-changed={types_src}");
  println!("cargo:rerun-if-changed={types_check}");
  println!("cargo:rerun-if-env-changed=GIT_SHA");
  println!(
    "cargo:rustc-env=GIT_SHA={}",
    env::var("GIT_SHA").unwrap_or_else(|_| "dev".into())
  );

  if Path::new(types_src).exists() {
    let pnpm = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
    let status = Command::new(pnpm)
      .args(["--filter", "@railway-latency/types", "gen:schema"])
      .status()
      .expect("run `pnpm --filter @railway-latency/types gen:schema`");
    assert!(status.success(), "schema generation failed");
  }

  let mut type_space = TypeSpace::new(
    TypeSpaceSettings::default().with_derive("PartialEq".to_string())
  );

  let mut seen_definitions: HashSet<String> = HashSet::new();

  for schema_path in SCHEMAS {
    let content = fs
      ::read_to_string(schema_path)
      .unwrap_or_else(|err| panic!("read {schema_path}: {err}"));
    let mut schema = serde_json
      ::from_str::<schemars::schema::RootSchema>(&content)
      .unwrap_or_else(|err| panic!("parse {schema_path}: {err}"));

    schema.definitions.retain(|name, _| seen_definitions.insert(name.clone()));

    type_space.add_root_schema(schema).expect("add schema to type space");
  }

  let generated = prettyplease::unparse(
    &syn::parse2::<syn::File>(type_space.to_stream()).unwrap()
  );

  let out = Path::new(&env::var("OUT_DIR").unwrap()).join("wire_types.rs");
  fs::write(out, generated).expect("write generated types");
}
