// AEO Content Studio - Frontend Application

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const generateForm = document.getElementById('generateForm');
  const generateBtn = document.getElementById('generateBtn');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const resultsContainer = document.getElementById('resultsContainer');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  // Collapsible toggles
  const ctaToggle = document.getElementById('ctaToggle');
  const ctaContent = document.getElementById('ctaContent');
  const imageToggle = document.getElementById('imageToggle');
  const imageContent = document.getElementById('imageContent');

  // Progress steps
  const stepText = document.getElementById('stepText');
  const stepImage = document.getElementById('stepImage');

  // Output elements
  const articlePreview = document.getElementById('articlePreview');
  const mediumCopy = document.getElementById('mediumCopy');
  const linkedinCopy = document.getElementById('linkedinCopy');
  const generatedImage = document.getElementById('generatedImage');
  const noImage = document.getElementById('noImage');
  const imageMessage = document.getElementById('imageMessage');
  const imagePromptText = document.getElementById('imagePromptText');
  const imagePromptContainer = document.getElementById('imagePromptContainer');
  const downloadImageBtn = document.getElementById('downloadImage');

  // Store generated data
  let generatedData = null;

  // Initialize collapsible sections
  function initCollapsibles() {
    ctaToggle.addEventListener('click', () => {
      ctaToggle.classList.toggle('active');
      ctaContent.classList.toggle('open');
    });

    imageToggle.addEventListener('click', () => {
      imageToggle.classList.toggle('active');
      imageContent.classList.toggle('open');
    });
  }

  // Initialize image provider selection
  function initImageProviderSelection() {
    const radioButtons = document.querySelectorAll('input[name="imageProvider"]');
    const openaiKeyGroup = document.getElementById('openaiKeyGroup');
    const geminiKeyGroup = document.getElementById('geminiKeyGroup');

    radioButtons.forEach(radio => {
      radio.addEventListener('change', (e) => {
        // Hide all key groups first
        openaiKeyGroup.style.display = 'none';
        geminiKeyGroup.style.display = 'none';
        
        // Show relevant key group
        if (e.target.value === 'openai') {
          openaiKeyGroup.style.display = 'block';
        } else if (e.target.value === 'gemini-imagen') {
          geminiKeyGroup.style.display = 'block';
        }
      });
    });
  }

  // Initialize tabs
  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.tab;

        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update active pane
        panes.forEach(pane => {
          pane.classList.remove('active');
          if (pane.id === `${targetId}Pane`) {
            pane.classList.add('active');
          }
        });
      });
    });
  }

  // Show toast notification
  function showToast(message, duration = 2500) {
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // Copy to clipboard
  async function copyToClipboard(text, successMessage = 'Copied to clipboard!') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(successMessage);
    }
  }

  // Initialize copy buttons
  function initCopyButtons() {
    document.getElementById('copyMarkdown').addEventListener('click', () => {
      if (generatedData?.articleMarkdown) {
        copyToClipboard(generatedData.articleMarkdown, 'Markdown copied!');
      }
    });

    document.getElementById('copyHtml').addEventListener('click', () => {
      if (generatedData?.articleHtml) {
        copyToClipboard(generatedData.articleHtml, 'HTML copied!');
      }
    });

    document.getElementById('copyMedium').addEventListener('click', () => {
      if (generatedData?.mediumCopy) {
        copyToClipboard(generatedData.mediumCopy, 'Medium copy copied!');
      }
    });

    document.getElementById('copyLinkedin').addEventListener('click', () => {
      if (generatedData?.linkedinCopy) {
        copyToClipboard(generatedData.linkedinCopy, 'LinkedIn copy copied!');
      }
    });

    downloadImageBtn.addEventListener('click', () => {
      if (generatedData?.imageUrl) {
        downloadImage(generatedData.imageUrl);
      }
    });
  }

  // Download image
  async function downloadImage(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `aeo-article-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      
      showToast('Image downloaded!');
    } catch (err) {
      // Fallback: open in new tab
      window.open(url, '_blank');
      showToast('Image opened in new tab');
    }
  }

  // Update loading progress
  function updateProgress(step) {
    stepText.classList.remove('active', 'done');
    stepImage.classList.remove('active', 'done');

    if (step === 'text') {
      stepText.classList.add('active');
    } else if (step === 'image') {
      stepText.classList.add('done');
      stepImage.classList.add('active');
    } else if (step === 'done') {
      stepText.classList.add('done');
      stepImage.classList.add('done');
    }
  }

  // Display results
  function displayResults(data) {
    generatedData = data;

    // Show results container
    emptyState.style.display = 'none';
    resultsContainer.classList.add('active');

    // Article tab
    articlePreview.innerHTML = data.articleHtml || '<p>No article content generated.</p>';

    // Social media tab
    mediumCopy.value = data.mediumCopy || '';
    linkedinCopy.value = data.linkedinCopy || '';

    // Image tab
    imagePromptText.textContent = data.imagePrompt || 'No image prompt generated.';

    if (data.imageUrl) {
      generatedImage.src = data.imageUrl;
      generatedImage.style.display = 'block';
      noImage.style.display = 'none';
      downloadImageBtn.style.display = 'flex';
    } else {
      generatedImage.style.display = 'none';
      noImage.style.display = 'block';
      downloadImageBtn.style.display = 'none';
      
      if (data.imageError) {
        imageMessage.textContent = `Image generation failed: ${data.imageError}`;
      } else {
        imageMessage.textContent = 'No image generated. Select Gemini Imagen 3 or DALL-E 3 in the Image Generation section.';
      }
    }

    // Switch to article tab
    document.querySelector('.tab[data-tab="article"]').click();
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(generateForm);
    const imageProvider = formData.get('imageProvider');
    const data = {
      topic: formData.get('topic'),
      businessType: formData.get('businessType'),
      websiteUrl: formData.get('websiteUrl'),
      bookingUrl: formData.get('bookingUrl'),
      phone: formData.get('phone'),
      ygyId: formData.get('ygyId'),
      imageProvider: imageProvider !== 'none' ? imageProvider : null,
      openaiKey: imageProvider === 'openai' ? formData.get('openaiKey') : null,
      userGeminiKey: imageProvider === 'gemini-imagen' ? formData.get('userGeminiKey') : null
    };

    // Validate required fields
    if (!data.topic || !data.businessType) {
      showToast('Please fill in all required fields', 3000);
      return;
    }

    // Show loading state
    generateBtn.disabled = true;
    generateForm.style.display = 'none';
    loadingState.classList.add('active');
    updateProgress('text');

    try {
      // Update progress for image step if image generation requested
      const hasImageGeneration = !!data.imageProvider;
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      if (hasImageGeneration) {
        updateProgress('image');
      }

      const result = await response.json();
      
      updateProgress('done');
      
      // Short delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));

      // Display results
      displayResults(result);
      showToast('Content kit generated successfully!', 3000);

    } catch (error) {
      console.error('Generation error:', error);
      showToast(`Error: ${error.message}`, 4000);
      
      // Reset to empty state
      emptyState.style.display = 'flex';
      resultsContainer.classList.remove('active');
    } finally {
      // Reset form state
      generateBtn.disabled = false;
      generateForm.style.display = 'block';
      loadingState.classList.remove('active');
    }
  }

  // Initialize
  initCollapsibles();
  initImageProviderSelection();
  initTabs();
  initCopyButtons();
  generateForm.addEventListener('submit', handleSubmit);

  // Check API health on load
  fetch('/api/health')
    .then(res => res.json())
    .then(data => {
      if (!data.geminiConfigured) {
        showToast('Warning: Gemini API key not configured on server', 5000);
      }
    })
    .catch(() => {
      // Server might not be running yet
    });
});
