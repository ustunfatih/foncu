import typing

__version__ = "0.5.0"
__all__ = ["Crawler", "__version__"]


def __getattr__(name):
    # PEP-562: Lazy loaded attributes on python modules
    if name == "Crawler":
        # pylint: disable=import-outside-toplevel
        from tefas.crawler import Crawler

        return Crawler

    raise AttributeError(f"module {__name__} has no attribute {name}")


if typing.TYPE_CHECKING:
    from tefas.crawler import Crawler
