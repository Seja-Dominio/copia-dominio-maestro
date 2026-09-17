from __future__ import annotations

import os
from typing import Any

import pandas as pd


def _value(item: Any, field: str) -> float:
    value = getattr(item, field, 0)
    return float(value or 0)


def _dataset_rows(dataset: Any, variables: tuple[str, ...]) -> list[dict[str, Any]]:
    if dataset is None or "channel" not in dataset.coords or "metric" not in dataset.coords:
        return []
    channels = [str(value) for value in dataset.coords["channel"].values]
    metrics = {str(value) for value in dataset.coords["metric"].values}
    distribution = "posterior" if "distribution" in dataset.coords and "posterior" in dataset.coords["distribution"].values else None
    rows: list[dict[str, Any]] = []
    for channel in channels:
        row: dict[str, Any] = {"channel": channel}
        for variable in variables:
            if variable not in dataset.data_vars:
                continue
            for metric in ("mean", "median", "ci_low", "ci_high"):
                if metric not in metrics:
                    continue
                selector = {"channel": channel, "metric": metric}
                if distribution:
                    selector["distribution"] = distribution
                try:
                    value = dataset[variable].sel(**selector).item()
                    row[f"{variable}_{metric}"] = float(value)
                except (KeyError, TypeError, ValueError):
                    continue
        if len(row) > 1:
            rows.append(row)
    return rows


def run_meridian(observations: list[Any], kpi_type: str) -> dict[str, Any]:
    try:
        from meridian import constants
        from meridian.data import data_frame_input_data_builder
        from meridian.model import model, spec
        from meridian.analysis import analyzer
    except ImportError as error:
        raise ImportError("O pacote google-meridian não está instalado no worker.") from error

    rows: list[dict[str, Any]] = []
    paid_channels = sorted({channel for item in observations for channel in item.paid})
    organic_channels = sorted({channel for item in observations for channel in item.organic})
    search_channels = sorted({channel for item in observations for channel in item.searches})
    for item in observations:
        row: dict[str, Any] = {"time": item.time.isoformat(), "geo": item.geo, "kpi": float(item.kpi)}
        for channel in paid_channels:
            value = item.paid.get(channel)
            row[f"paid_{channel}_impressions"] = _value(value, "impressions") if value else 0
            row[f"paid_{channel}_spend"] = _value(value, "spend") if value else 0
        for channel in organic_channels:
            value = item.organic.get(channel)
            row[f"organic_{channel}_impressions"] = _value(value, "impressions") if value else 0
        for channel in search_channels:
            row[f"search_{channel}"] = float(item.searches.get(channel, 0) or 0)
        rows.append(row)

    frame = pd.DataFrame(rows).fillna(0)
    media_cols = [f"paid_{channel}_impressions" for channel in paid_channels]
    spend_cols = [f"paid_{channel}_spend" for channel in paid_channels]
    organic_cols = [f"organic_{channel}_impressions" for channel in organic_channels]
    non_media_cols = [f"search_{channel}" for channel in search_channels]
    builder = data_frame_input_data_builder.DataFrameInputDataBuilder(
        kpi_type=constants.KPI_TYPE_REVENUE if kpi_type == "revenue" else constants.KPI_TYPE_NON_REVENUE,
    )
    builder = builder.with_kpi(frame, kpi_col="kpi", time_col="time", geo_col="geo")
    builder = builder.with_media(
        frame,
        media_cols=media_cols,
        media_spend_cols=spend_cols,
        media_channels=paid_channels,
        time_col="time",
        geo_col="geo",
    )
    if organic_cols:
        try:
            builder = builder.with_organic_media(frame, organic_media_cols=organic_cols, organic_media_channels=organic_channels, media_time_col="time", geo_col="geo")
        except TypeError:
            builder = builder.with_organic_media(frame, organic_media_cols=organic_cols, organic_media_channels=organic_channels, time_col="time", geo_col="geo")
    if non_media_cols:
        builder = builder.with_non_media_treatments(frame, non_media_treatment_cols=non_media_cols, time_col="time", geo_col="geo")

    input_data = builder.build()
    model_spec = spec.ModelSpec(
        media_prior_type="roi",
        organic_media_prior_type="contribution",
        non_media_treatments_prior_type="contribution",
    )
    fitted = model.Meridian(input_data=input_data, model_spec=model_spec)
    fitted.sample_prior(int(os.environ.get("MMM_PRIOR_DRAWS", "200")))
    fitted.sample_posterior(
        n_chains=int(os.environ.get("MMM_CHAINS", "2")),
        n_adapt=int(os.environ.get("MMM_ADAPT", "300")),
        n_burnin=int(os.environ.get("MMM_BURNIN", "100")),
        n_keep=int(os.environ.get("MMM_KEEP", "300")),
    )
    analysis = analyzer.Analyzer(fitted)
    paid_summary = analysis.summary_metrics(
        use_kpi=kpi_type == "non_revenue",
        aggregate_geos=True,
        aggregate_times=True,
        include_non_paid_channels=False,
    )
    non_paid_summary = analysis.summary_metrics(
        use_kpi=kpi_type == "non_revenue",
        aggregate_geos=True,
        aggregate_times=True,
        include_non_paid_channels=True,
    )
    return {
        "model": "google-meridian",
        "paid_channels": _dataset_rows(paid_summary, ("spend", "incremental_outcome", "pct_of_contribution", "roi", "mroi", "effectiveness")),
        "non_paid_channels": _dataset_rows(non_paid_summary, ("incremental_outcome", "pct_of_contribution", "effectiveness")),
        "settings": {
            "chains": int(os.environ.get("MMM_CHAINS", "2")),
            "adapt": int(os.environ.get("MMM_ADAPT", "300")),
            "burnin": int(os.environ.get("MMM_BURNIN", "100")),
            "keep": int(os.environ.get("MMM_KEEP", "300")),
        },
        "note": "Resultados são estimativas causais com intervalo de credibilidade; não substituem validação experimental.",
    }
