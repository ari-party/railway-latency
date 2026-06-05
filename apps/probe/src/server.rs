use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use http_body_util::Full;
use hyper::body::{ Bytes, Incoming };
use hyper::header::{ HeaderValue, CONTENT_TYPE };
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{ Request, Response };
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

use crate::queue::SampleQueue;

async fn handle(
  req: Request<Incoming>,
  queue: Arc<SampleQueue>
) -> Result<Response<Full<Bytes>>, Infallible> {
  if req.uri().path() == "/samples" {
    let body = queue.serialize_and_clear();
    let mut res = Response::new(Full::new(Bytes::from(body)));
    res
      .headers_mut()
      .insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    return Ok(res);
  }

  let mut res = Response::new(Full::new(Bytes::from_static(b"OK")));
  res
    .headers_mut()
    .insert(
      CONTENT_TYPE,
      HeaderValue::from_static("text/plain; charset=utf-8")
    );
  Ok(res)
}

pub async fn serve(
  port: u16,
  queue: Arc<SampleQueue>
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  let addr = SocketAddr::from(([0, 0, 0, 0], port));
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

    let queue = queue.clone();
    tokio::task::spawn(async move {
      let service = service_fn(move |req| handle(req, queue.clone()));
      if
        let Err(err) = http1::Builder
          ::new()
          .serve_connection(TokioIo::new(stream), service).await
      {
        eprintln!("connection error: {err}");
      }
    });
  }
}
