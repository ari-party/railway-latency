use std::convert::Infallible;
use std::net::SocketAddr;
use std::time::{ SystemTime, UNIX_EPOCH };

use http_body_util::Full;
use hyper::body::{ Bytes, Incoming };
use hyper::header::{ HeaderValue, CONTENT_TYPE };
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{ Request, Response };
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

async fn ok(
  _req: Request<Incoming>
) -> Result<Response<Full<Bytes>>, Infallible> {
  let received_ms = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);

  let mut res = Response::new(Full::new(Bytes::from_static(b"OK")));
  let headers = res.headers_mut();

  headers.insert(
    CONTENT_TYPE,
    HeaderValue::from_static("text/plain; charset=utf-8")
  );

  if let Ok(value) = HeaderValue::from_str(&received_ms.to_string()) {
    headers.insert("x-echo-received", value);
  }

  Ok(res)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
  let addr: SocketAddr = format!("0.0.0.0:{port}").parse()?;

  let listener = TcpListener::bind(addr).await?;
  println!("Server listening on {addr}");

  loop {
    let (stream, _) = match listener.accept().await {
      Ok(conn) => conn,
      Err(err) => {
        eprintln!("accept error: {err}");
        continue;
      }
    };

    let io = TokioIo::new(stream);
    tokio::task::spawn(async move {
      if
        let Err(err) = http1::Builder
          ::new()
          .serve_connection(io, service_fn(ok)).await
      {
        eprintln!("connection error: {err}");
      }
    });
  }
}
