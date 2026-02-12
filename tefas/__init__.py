# pylint: disable=unused-import
# pylint: disable=import-outside-toplevel
# pylint: disable=redefined-outer-name

__version__ = "0.5.0"
__all__ = ["Crawler", "__version__"]


def __getattr__(name):
    # PEP-562: Lazy loaded attributes on python modules
    if name == "Crawler":
        from tefas.crawler import Crawler

        return Crawler

    raise AttributeError(f"module {__name__} has no attribute {name}")


# TYPE_CHECKING workaround for static analysis tools
# This ensures Crawler is available for type checkers without causing import loops
STATIC_CHECKER_WORKAROUND = False
if STATIC_CHECKER_WORKAROUND:
    from tefas.crawler import Crawler
