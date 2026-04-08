from django.urls import path, include
from django.views.generic import TemplateView

urlpatterns = [
    path('api/', include('api.urls')),
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('deposit/', TemplateView.as_view(template_name='deposit.html'), name='deposit'),
    path('news/', TemplateView.as_view(template_name='news.html'), name='news'),
    path('admin-profile/', TemplateView.as_view(template_name='admin_profile.html'), name='admin_profile'),
]
