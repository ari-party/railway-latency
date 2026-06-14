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

use crate::queue::Queue;
use crate::wire::{ ErrorEvent, ProbeSample };

fn json_response(body: Vec<u8>) -> Response<Full<Bytes>> {
  let mut res = Response::new(Full::new(Bytes::from(body)));
  res
    .headers_mut()
    .insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
  res
}

async fn handle(
  req: Request<Incoming>,
  samples: Arc<Queue<ProbeSample>>,
  errors: Arc<Queue<ErrorEvent>>
) -> Result<Response<Full<Bytes>>, Infallible> {
  match req.uri().path() {
    "/samples" => Ok(json_response(samples.serialize_and_clear())),
    "/errors" => Ok(json_response(errors.serialize_and_clear())),
    _ => {
      let mut res = Response::new(Full::new(Bytes::from_static(b"OK")));
      res
        .headers_mut()
        .insert(
          CONTENT_TYPE,
          HeaderValue::from_static("text/plain; charset=utf-8")
        );
      Ok(res)
    }
  }
}

pub async fn serve(
  port: u16,
  samples: Arc<Queue<ProbeSample>>,
  errors: Arc<Queue<ErrorEvent>>
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  let addr = SocketAddr::from(([0, 0, 0, 0], port));
  let listener = TcpListener::bind(addr).await?;
  tracing::info!(event = "listening", addr = %addr, "probe server listening");

  loop {
    let (stream, _) = match listener.accept().await {
      Ok(conn) => conn,
      Err(error) => {
        tracing::error!(
          event = "error",
          source = "accept",
          error = %error,
          "failed to accept connection",
        );
        continue;
      }
    };

    let samples = samples.clone();
    let errors = errors.clone();
    tokio::task::spawn(async move {
      let service = service_fn(move |req|
        handle(req, samples.clone(), errors.clone())
      );
      if
        let Err(error) = http1::Builder
          ::new()
          .serve_connection(TokioIo::new(stream), service).await
      {
        tracing::error!(
          event = "error",
          source = "connection",
          error = %error,
          "error serving connection",
        );
      }
    });
  }
}
