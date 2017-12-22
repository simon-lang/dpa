window.SPLASH_SCREEN = true;
window.LEAVE_NOTICE = true;

window.NOEQUIPMENT = parseInt('0x1000000', 16);

if (!window.console) console = { log: function() {} };

jQuery(function($) {

    // Print views don't run javascript
    if ($('#ifThisDivExistsDoNotRunJavascript').length) {
        $('.exit-print-view').remove();
        $('.print-btn').on('click', function() {
            window.print();
        });
        return;
    }

    enableWindowLeaveNotice();

    var activityTypes = ['warmup', 'core', 'cooldown'];

    window.LessonPlan = Backbone.Model.extend({
        defaults: {
            week: '',
            lessonNumber: '',
            grade: '',
            lessonLength: '',
            numberOfStudents: '',
            lessonObjectives: '',
            equipmentRequired: '',
            safetyRequirements: '',
            coachesTips: '',
            activityIds: []
        }
    });

    window.LessonPlanView = Backbone.View.extend({
        
        tagName: 'div',

        model: new LessonPlan,

        template: _.template($('#lesson-plan-template').html()),
        
        el: $('#lesson-plan').get(0),

        events: {
            'click .generate-pdf': 'generatePdf',
            'click .print': 'printView'
        },

        render: function() {
            $(this.el).html(this.template(this.model.toJSON()));
            return this;
        },

        submitLessonPlan: function() {
            // Serialize form into model
            var model = {
                activityIds: []
            };
            _.map(this.$('form').serializeArray(), function(o) {
                model[o.name] = o.value;
            });
            for (var i = 0; i < App.activityViews.length; i++) {
                if (App.activityViews[i].$el.is(":visible")) {
                    model.activityIds.push(App.activityViews[i].getModel().get('id'));
                }
            }
            model.versionId = DPA.activities.id;
            model.versionTitle = DPA.activities.ver;
            
            this.model.set(model);
        },

        generatePdf: function() {
            this.submitLessonPlan();
            disableWindowLeaveNotice();
            $.downloadLesson({ url: DPA.pdfUrl, data : this.model.toJSON() });            
        },

        printView: function() {
            this.submitLessonPlan();
            
            $('#lesson-plan-modal').modal('hide');
            
            var lessonPlanPrintView = new LessonPlanPrintView({
                model: this.model
            });

            // Print view in child window 
            App.secondCorePanelShouldBeVisible = $('#core-list2').is(':visible');
            var w = window.open("#print-view");
        },

        getModel: function() {
            return this.model;            
        }

    });

    window.LessonPlanPrintView = Backbone.View.extend({

        tagName: 'div',

        template: _.template($('#lesson-plan-print-template').html()),
        
        el: $('#lesson-plan-print').get(0),

        initialize: function() {
            this.render();
        },

        render: function() {
            $(this.el).html(this.template(this.model.toJSON()));
            return this;
        }

    });        

    /* ActivityOptions are for Filtering
    ---------------------------------------- */

    window.ActivityOption = Backbone.Model.extend({
        defaults: {
            legend: '',
            multiselect: true
        }
    });

    window.ActivityOptionList = Backbone.Collection.extend({
        model: ActivityOption
    });

    window.ActivityOptions = new ActivityOptionList;

    window.ActivityOptionView = Backbone.View.extend({
        
        tagName: "fieldset",

        template: _.template($('#options-template').html()),

        events: {
            'change .opt-check': 'updateFilters',
            'click .toggle-equipment': 'toggleAllEquipment',
            'click .toggle-environment': 'toggleAllEnvironment',
            'click .none-required': 'toggleDisableAllOptions'
        },
        initialize: function() {


            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
        },

        render: function() {
          $(this.el).html(this.template(this.model.toJSON()));
          return this;
        },

        remove: function() {
          $(this.el).remove();
        },

        updateFilters: function(e) {
            var model = this.model;
            var totalChecked = 0;

            // Calculate the bitmask for each option
            var bitmasks = {};
            ActivityOptions.each(function(option) {
                var optionName = option.get('name');
                bitmasks[optionName] = 0;
                $('input[name='+optionName+']:checked').each(function() {
                    bitmasks[optionName] += parseInt($(this).val());
                    if ($(this).val() != "16777216" && $(this).parent().hasClass('equipment')) totalChecked += 1;
                });

                var enable = totalChecked == 0;

                var $noneRequired = $('.none-required');
                var $noneRequiredCB = $('.none-required input');

                if (enable) {
                    $noneRequiredCB.removeAttr('disabled');
                    $noneRequired.css('color', '');
                } else {
                    $noneRequiredCB.attr('disabled', 'disabled');
                    $noneRequired.css('color', '#777');
                }

            });

            model.bitmasks = bitmasks;

            // For each option:activity combo, check it's bitmask
            Activities.each(function(activity) {
                var matchesOptions = true;
                for (var optionName in bitmasks) {
                    if (!bitmasks.hasOwnProperty(optionName)) {
                         continue;                               
                    }
                    var bitmask = bitmasks[optionName];
                    
                    // Get this activity's bitmask. e.g.
                    //  "Jumping" activity's "Equipment" attr== 0 because no equipment required
                    // "Soccer" activity's "Equipment" attr==66 because need Marker (2) and Ball (64) 
                    var activityAttributeValue = activity.get(optionName);
                        
                    // If NO bits match bitmask, AND bitmask is non-zero. Hide this activity.
                    if ((activityAttributeValue & bitmask) === 0 && bitmask !== 0) {
                        matchesOptions = false;
                        // No need to check remaining options for this activity
                        break;
                    }
                }

                // If this activity matched all bitmasks, mark it as available.
                if (matchesOptions) {
                    activity.set({ matchesOptions: true });
                }
                else {
                    // Else mark it as unavailable, and hide it.
                    activity.set({ matchesOptions: false });
                }
            });

            // 
            for (var i = 0; i < App.activityViews.length; i++) {
                var view = App.activityViews[i];
                view.render();
            }

            // If the second Core activity pane is visible, 
            //  we need to manually hide the first pane's Add button
            if ($('#core-list2:visible').length) {
                $('.act-actions .add').hide();
            };

            // Animate the total readouts to draw attention to the fact they have changed.
            $('.total').pulse({
                'opacity': '0.1'
            }, 1000, 1);

        },

        toggleAllEquipment: function() {

            var isChecked = this.$el.find('.toggle-all input').is(':checked');
            var $noneRequired = $('.none-required');
            var $noneRequiredCB = $('.none-required:input');

            if (isChecked) {
                $noneRequiredCB.attr('checked', false);
                $noneRequiredCB.attr('disabled', 'disabled');
            } else {
                $noneRequiredCB.removeAttr('disabled');
            }    

            this.$el.find('.equipment input').attr('checked', isChecked);

            this.updateFilters();
        },

        toggleAllEnvironment: function() {

            var isChecked = this.$el.find('.toggle-environment input').is(':checked');
            this.$el.find('.environment input').attr('checked', isChecked);

            this.updateFilters();
        },

        toggleDisableAllOptions: function() {

            var isChecked = this.$el.find('input[value="16777216"]').is(':checked');
            
            var $equipmentLabel = $('.equipment');
            var $toggleLabel = this.$el.find('.toggle-all');

            var $toggleCB = $toggleLabel.find('input');
            var $equipmentCB = $('.equipment input');

            if (isChecked) {
                $equipmentCB.attr('disabled', 'disabled');
                $toggleCB.attr('disabled', 'disabled');
                $equipmentLabel.css('color', '#777');
                $toggleLabel.css('color', '#777');
                $equipmentCB.attr('checked', false);

            } else {
                $equipmentCB.removeAttr('disabled');
                $toggleCB.removeAttr('disabled');
                $equipmentLabel.css('color', '');
                $toggleLabel.css('color', '');
            }
            this.updateFilters();
        }

    });

    
    /* Activity "Full Details" Popup
    ---------------------------------------- */

    window.ActivityFullDetailsView = Backbone.View.extend({
        
        tagName: "div",

        template: _.template($('#activity-full-details-template').html()),

        events: {
            'click .btn-print-activity': 'printActivity'
        },

        render: function() {
            $(this.el).html(this.template({model: this.model}));
            return this;
        },

        printActivity: function() {
            // Print activity in child window 
            window.App.printActivityModel = this.model;
            window.open(window.location.origin + window.location.pathname + "#print-activity-view");
        }

    });

    
    /* Dropdown list of available Activities
    ---------------------------------------- */

    window.ActivityDropdownView = Backbone.View.extend({
        
        tagName: "ul",

        template: _.template($('#activity-dropdown-template').html()),

        render: function() {
            var self = this;
            var $container = self.$el.html(this.template()).find('ul');
            _.each(this.collection, function(item) {
                var view = new ActivityDropdownItemView({ 
                    model: item,
                    activityView: self.options.activityView
                });
                $container.append(view.render().el);
            });
            return this;
        }

    });

    window.ActivityDropdownItemView = Backbone.View.extend({
        
        tagName: "li",

        template: _.template($('#activity-dropdown-item-template').html()),

        events: {
            'click span.selectActivity': 'selectActivity'
        },

        render: function() {
            $(this.el).append(this.template({model: this.model}));
            return this;
        },

        selectActivity: function(e) {
            $('#invisibleOverlay').hide();
            this.options.activityView.setModel(this.model);
        }

    });

    
    /* Activities are the central panels of this app
    ---------------------------------------- */

    window.Activity = Backbone.Model.extend({
        
        defaults: function() {
            return {
                matchesOptions: true
            };
        },

        initialize: function() {
            // Expose unique model id to the view
            this.attributes.cid = this.cid;
        }

    });

    window.ActivityList = Backbone.Collection.extend({
        
        model: Activity,

        getActivity: function(type, index) {
            return this.filterByType(type)[index];
        },

        filterByType: function(type) {
            return this.filter(function(activity){
                return activity.get('type') == type && activity.get('matchesOptions') == true;
            }, type);
        },

        comparator: function(activity) {
            return activity.get('order');
        }

    });

    window.Activities = new ActivityList;

    window.ActivityView = Backbone.View.extend({
        
        tagName: "div",

        template: _.template($('#activity-template').html()),

        events: {
            'click .next:not(.disabled)': 'next',
            'click .prev:not(.disabled)': 'previous',
            'click .act-select .drop': 'showDropdown',
            'click .show-full-details': 'showFullDetails'
        },

        initialize: function() {
          this.model.bind('change', this.render, this);
          this.model.bind('destroy', this.remove, this);
        },

        render: function() {
          $(this.el).html(this.template(this.model.toJSON()));
          return this;
        },

        remove: function() {
          $(this.el).remove();
        },

        toggleVisible: function() {
            this.model.toggleVisible();
        },

        next: function() {
            var type = this.model.get('type');
            if (++this.currentActivityPointer > Activities.filterByType(type).length - 1) {
                this.currentActivityPointer = 0;
            }

            window.currentlyAnimatingActivityPane = this;
            var $content = this.$('.act-content *, .act-header h2, .equip');
            $content.css('position', 'relative').animate({
                left: "-1000px"
            }, 400, function() {
                currentlyAnimatingActivityPane.model = Activities.getActivity(type, currentlyAnimatingActivityPane.currentActivityPointer);
                currentlyAnimatingActivityPane.render();
            });

            if ($('#core-list2:visible').length) {
                $("#core-list .add").hide();
            }
        },

        getModel: function() {
            return this.model;
        },

        previous: function() {
            var type = this.model.get('type');
            if (--this.currentActivityPointer < 0) {
                this.currentActivityPointer = Activities.filterByType(type).length - 1;
            }

            window.currentlyAnimatingActivityPane = this;
            var $content = this.$('.act-content *, .act-header h2, .equip');
            $content.css('position', 'relative').animate({
                left: "1000px"
            }, 400, function() {
                currentlyAnimatingActivityPane.model = Activities.getActivity(type, currentlyAnimatingActivityPane.currentActivityPointer);
                currentlyAnimatingActivityPane.render();
            });

            
            if ($('#core-list2:visible').length) {
                $("#core-list .add").hide();
            }
        },

        setModel: function(model) {
            this.model = model;
            this.currentActivityPointer = _.indexOf(_.pluck(Activities.filterByType(this.model.get('type')), 'cid'), this.model.cid);
            this.render();
        },

        showDropdown: function() {

            var self = this;
            var el = this.$('.act-dropdown').get(0);
            if ($(el).is(':visible')) {
                $(el).slideUp(200);
                return;
            };

            // Create a new view and show it
            var type = this.model.get('type');
            var view = new ActivityDropdownView({
                collection: Activities.filterByType(type),
                el: el,
                activityView: self  // Expose this view so it can be changed from dropdown
            });
            view.render();
            $(el).slideDown(200);

            // Fourth column does not need margins. TODO: Can this be shifted to LESS?
            $(el).find('li:nth-child(4n)').css({
                'border': 'none',
                'margin-right': '0'
            });

            $('#invisibleOverlay').show();
        },

        showFullDetails: function() {
            if ($('#activity-modal').length == 0) {
                $('body').append('<div class="modal" id="activity-modal"></div>');
            }
            var model = this.getModel();
            var view = new ActivityFullDetailsView({
                model: model,
                el: $('#activity-modal').get(0)
            });
            view.render();
            $('#activity-modal').modal('show');
            $('#activity-modal').on('hidden', function () {
                view.remove();
            })
        }

    });

    
    /* The App
    ---------------------------------------- */

    window.AppView = Backbone.View.extend({
        
        el: $('#activities-app'),

        events: {
            'click .utility .sort': 'toggleOptionsView',
            'click .act-actions .add': 'showSecondCorePanel',
            'click .act-actions .delete': 'hideSecondCorePanel',
            'click .spl': 'start',
            'click .utility .publish': 'showLessonPlan',
            'click .lucky': 'displayRandomActivities',
            'click .print-btn': 'print',
            'click #invisibleOverlay': 'clickInvisibleOverlay',
            'click .close-options-pane': 'clickInvisibleOverlay',
            'click #blackOverlay': 'clickblackOverlay',
            'click .welcome-close': 'clickblackOverlay',
            'click #help-next': 'nextHelpStep',
            'click #help-prev': 'prevHelpStep'
        },

        initialize: function() {
            // Populate Activities and create corresponding Views
            var models = [];
            for (var i = 0; i < activityTypes.length; i++) {
                var type = activityTypes[i];
                DPA.activities[type] = _.sortBy(DPA.activities[type], function(act) {
                    return act.name;
                });
                for (var j=0; j < DPA.activities[type].length; j++) {
                    var model = _.clone(DPA.activities[type][j]);
                    model.type = type;
                    model.order = j;
                    models.push(model);
                }
            }
            Activities.reset(models);
            this.createActivityViews();

            // Populate Activity Options and create corresponding Views
            models = [];
            for (var i = 0; i < DPA.options.length; i++) {
                var model = _.clone(DPA.options[i]);
                models.push(model);
            }
            ActivityOptions.reset(models);
            this.createOptionViews();

            // Create Views for Lesson Plan
            this.lessonPlanView = new LessonPlanView();
            this.lessonPlanView.render();

            if (!SPLASH_SCREEN) {
                this.start();
            }
        },

        start: function(event) {
            if($(event.target).is('a[@data-type="file"]')) 
            {
                return;
            }
            
            $('.spl').slideUp();
            // Check cookie, if not set then
            if ($.cookie('lastVisit')==null) {
                // Set cookie
                $.cookie('lastVisit', 'today'); // TODO: Replace with date
                // Show tutorial prompt
                $('.welcome,#blackOverlay').show();
            };
        },

        clickblackOverlay: function() {
            $('#blackOverlay').hide();
            $('.welcome').hide();
        },

        createActivityViews: function() {
            this.createActivityView('warmup', this.$("#warmup-list").get(0)).render();
            this.createActivityView('core', this.$("#core-list").get(0)).render();
            this.createActivityView('core', this.$("#core-list2").get(0)).render();
            this.createActivityView('cooldown', this.$("#cooldown-list").get(0)).render();
        },

        activityViews: [],

        createActivityView: function(type, el) {
            var randomIndex = Math.floor(Activities.filterByType(type).length * Math.random());
            var view = new ActivityView({
                model: Activities.getActivity(type, randomIndex),
                el: el,
                type: type
            });
            view.currentActivityPointer = randomIndex;

            this.activityViews.push(view);

            return view;
        },
        
        displayRandomActivities: function() {

            this.$('.lucky,.next,.prev').fadeOut(200);

            this.secondCorePanelShouldBeVisible = $('#core-list2').is(':visible');

            // Animation domination
            $('#core-list2').slideUp(function() {
                $('.activity-view:visible').css({ 'overflow':'hidden' });
                $('.loadingPane1').slideDown(500, 'swing', function() {
                    $('.loadingPane2').slideDown(500, 'swing', function() {
                        $('.loadingPane3').slideDown(500, 'swing', function() {
                            
                            App.displayRandomActivity(0); 
                            App.displayRandomActivity(1); 
                            App.displayRandomActivity(2);
                            App.displayRandomActivity(3);

                            $('.loadingPane3').slideUp(function() {
                                $('.loadingPane2').slideUp(function() {
                                    $('.loadingPane1').slideUp(function() {
                                        $('.activity-view').css({ 'overflow':'visible' });
                                        $('.lucky,.next,.prev').fadeIn(200);
                                        if (App.secondCorePanelShouldBeVisible) {
                                            App.showSecondCorePanel();
                                        }
                                    });
                                });
                            });
                        });
                    });
                });
            });
        },

        displayRandomActivity: function(index) {
            var activityView = this.activityViews[index];
            var type = activityView.options.type;
            if (Activities.filterByType(type).length > 0) {
                var randomIndex = Math.floor(Activities.filterByType(type).length * Math.random());
                activityView.setModel(Activities.getActivity(type, randomIndex));
            }
            activityView.$('.loadingPane').hide();
        },

        showSecondCorePanel: function() {
            this.$("#core-list2").slideDown(200);
            this.$("#core-list .add").hide();
            $('.tooltip').hide();
        },

        hideSecondCorePanel: function() {
            this.$("#core-list2").slideUp(200);
            this.$("#core-list .add").show();
            $('.tooltip').hide();
        },

        createOptionViews: function() {
            ActivityOptions.each(function(activityOption) {
                var view = new ActivityOptionView({model: activityOption});
                this.$("#options").append(view.render().el);
            });
        },

        toggleOptionsView: function() {
            $('.opt').slideToggle(200);
            this.toggleInvisibleOverlay();
        },

        toggleInvisibleOverlay: function() {
            $('#invisibleOverlay').toggle();
        },

        clickInvisibleOverlay: function() {
            $('.opt, .act-dropdown').slideUp(200);
            $('#invisibleOverlay').hide();
        },

        showLessonPlan: function() {
            // Show modal lesson plan window
            $('#lesson-plan-modal').modal('show');

            // Pre-populate the equipment required field
            var equipmentRequired = [];
            $('.equip-item:visible').each(function() {
                if ($(this).html().trim() !== 'Nil') {
                    equipmentRequired.push($(this).attr('title').trim());
                }
            });
            $('textarea[name=equipmentRequired]').val(_.uniq(equipmentRequired).join('\n'));

            $('.generate-pdf').hide();
            
            // Generate PDF button only shown while Online
            $.testConnection({ 
                success: function() {
                    $('.generate-pdf').show();
                    $('#lessonForm').attr("method", "POST").attr('action', DPA.pdfUrl);
                },
                error: function() {
                    // Hide generate-pdf moved out of here because this event
                    //  was not firing reliably
                },
                url: DPA.testUrl
            });
        },

        print: function() {
            window.print();                
        },   

        nextHelpStep: function() {
            var step = helpSteps[stepIndex];
            if (step && step.onunload) {
                step.onunload();
            }

            if (stepIndex >= helpSteps.length-1) {
                stepIndex = 0;
                $('.help').hide();  // Exit tutorial
            }
            else {
                stepIndex++;
            }
            this.updateStep();
        },

        prevHelpStep: function() {
            var step = helpSteps[stepIndex];
            if (step && step.onunload) {
                step.onunload();
            }

            if (stepIndex > 0) {
                stepIndex--;
            }
            this.updateStep();
        },


        // Move tutorial to next step
        updateStep: function() {
            var step = helpSteps[stepIndex];
            $('.help-title').html(step.title);
            $('.help-text').html(step.text);
            $('.help').css(step.css);
            $('.cutout').css(step.cutoutCss);
            if (step.onload) {
                step.onload();
                // Use scrollIntoView plugin to ensure help content is always visible on small screens.
                setTimeout(function() {
                    // Tweaking which item we want to force into view
                    var selector = (stepIndex < 5 || stepIndex > 8) ? '.help' : '.help-details';
                    $(selector).scrollintoview();
                }, 400);
            }
            var nextStep = helpSteps[stepIndex+1];
            if (nextStep) {
                $('#help-next span.next-step').html(nextStep.title);
            }
        }


    });

    // Run App
    window.App = new AppView;

    // Tooltips
    $('[rel=tooltip]').tooltip();


    // Help Tutorial Steps
    window.helpSteps = [
        {
            title: 'Filter the activities',
            text: 'To help you refine your activity selections you can click on the <strong><em>Filter Activities</em></strong> button to display a range of environment and equipment choices.',
            css: {
                top: '50px',
                left: '3px',
                width: '450px'
            },
            cutoutCss: {
                width: '175px',
                height: '65px',
                'margin-left': '0'
            },
            onload: function() {
                $('#help-next span:first-child').html('Next Step:');
                $('#help-close').show();
                $('#help-prev').hide();
            },
            onunload: function() {
                $('#help-prev').show();
            }
        },
        {
            title: 'Choose your filters',
            text: 'By default, all boxes are unchecked. You can check one or more boxes to filter the activities to match your available resources. You can also deselect all boxes if you wish to start over by clicking in the <strong><em>Select/Deselect All</em></strong> button. By clicking this button again all options will be selected.',
            css: {
                top: '55px',
                left: '0px',
                width:' 400px'
            },
            cutoutCss: {
                width: '712px',
                height: '368px'
            },
            onload: function() {
                $('.sort').click();                
            },
            onunload: function() {
                $('.sort').click();                
            }
        },
        {
            title: 'Browse filtered results',
            text: 'The total number of activities that matched your filters will now be displayed in this box. If the results show 0 of 5 activities that means that the activity you had displayed before your filtering choices does not match your needs. Once you start viewing the activities that match your filters the activity that does NOT match will be removed. <br><br>You can view the title of all activities by clicking the drop down arrow.',
            css: {
                top: '107px',
                left: '458px',
                width: '450px'
            },
            cutoutCss: {
                width: '234px',
                height: '60px',
                'margin-left': '205px'
            },
            onload: function() {
                //$('.sort').click();                
            }
        },
        {
            title: 'Select a warm up activity',
            text: 'To select an activity just click on the activity name in the drop down list now displayed.',
            css: {
                width: '500px',
                top: '104px',
                left: '0',
            },
            cutoutCss: {
                width: '940px',
                height: '378px',
                'margin-left': '0'
            },
            onload: function() {
                $('#warmup-list .act-select .drop').click();
            },
            onunload: function() {
                $('#warmup-list .act-select .drop').click();
            }
        },
        {
            title: 'Scroll arrows',
            text: 'Clicking on the scroll arrow located on either the left or right side of each activity area allows you to scroll through the available activities matching your filter choices.',
            css: {
                width: '500px',
                top: '269px',
                left: '0'
            },
            cutoutCss: {
                width: '100px',
                height: '100px',
                'margin-left': '-60px'
            },
            onload: function() {
                // ...
            }
        },
        {
            title: 'Select a core activity',
            text: 'You can now repeat the filtering and activity selection steps to choose your core activity. If you change your filter options you will not lose your Warm up activity.',
            css: {
                width: '580px',
                top: '440px',
                left: '0',
            },
            cutoutCss: {
                width: '940px',
                height: '70px',
                'margin-left': '0'
            },
            onload: function() {
                //..
            }
        },
        {
            title: 'Add another core activity',
            text: 'If your lesson time permits more activities, an additional core activity can be added. Just click on the plus sign located on the right side of the core activity title banner. Now select your activity for the second core box.',
            css: {
                width: '460px',
                top: '444px',
                left: '546px',
                'text-align': 'right'
            },
            cutoutCss: {
                width: '60px',
                height: '60px',
                'margin-left': '352px'
            }
        },
        {
            title: 'Remove an additional core activity',
            text: 'If the available time only permits one core activity simply remove the additional core activity box by clicking on the delete symbol located on the right hand side of the core activity title banner. ',
            css: {
                width: '460px',
                top: '781px',
                left: '546px',
                'text-align': 'right'
            },
            cutoutCss: {
                width: '60px',
                height: '60px',
                'margin-left': '352px'
            },
            onload: function() {
                $('#add-icon').click();
            },
            onunload: function() {
                $('.delete').click();
            }
        },
        {
            title: 'Select a cool down activity',
            text: 'To finish your lesson plan repeat the filtering and/or activity selection steps.',
            css: {
                width: '580px',
                top: '777px',
                left: '0',
            },
            cutoutCss: {
                width: '940px',
                height: '70px',
                'margin-left': '0'
            },
            onload: function() {
                // Jump to bottom of screen
                setTimeout(function() {
                    window.scrollTo(0, 1000);
                }, 1000);
            }
        },
        {
            title: 'View full details',
            text: 'At any time you wish to view the full activity details just click on the <strong><em>Full Details</em></strong> button located on the bottom right of each activity area. This will open a new window that displays more details on the activity, variations and any videos of the activity in action.<br><br> From here you can also save and/or print individual activities.',
            css: {
                width: '400px',
                top: '391px',
                left: '540px'
            },
            cutoutCss: {
                width: '120px',
                height: '33px',
                'margin-left': '278px'
            },
            onload: function() {
                // ...
            }
        },
        {
            title: 'Create your plan',
            text: 'When you are happy with the activities you have chosen for the three sections – warm up, core and cool down - click <strong><em>Create your plan</em></strong>. A new window opens.',
            css: {
                width: '300px',
                top: '50px',
                left: '550px'
            },
            cutoutCss: {
                width: '230px',
                height: '60px',
                'margin-left': '170px' 
            },
            onload: function() {
                $('#help-next span:first-child').html('');
                $('#help-next span.next-step').html('Exit tutorial');
                $('.help-close').hide();
            }
        }
    ];

    window.stepIndex = -1;

    // Load the tutorial
    $('body').on('click', '.tutorial', function(e) {
        $('.modal-backdrop, #blackOverlay, .welcome').hide();
        $('#page-modal').modal('hide');
        $('.help').show();
    });

    // Keyboard shortcuts
    $('body').keyup(function(e) {
        if (e.keyCode == 27) {  // Escape key
            $('.help').hide();
        }
        if (e.keyCode == 39) {  // Right Arrow
            $('#help-next:visible').click();
        }
        if (e.keyCode == 37) {  // Left Arrow
            $('#help-prev:visible').click();
        }
    });

    $('#help-next').click();

    // Close tutorial
    $('.help-close').on('click', '', function(e) {
        e.preventDefault();
        $('.help').hide();
    });

    // Print view has to be setup from the child window
    if (window.location.hash == '#print-view') {
        for (var i = 0; i < window.opener.App.activityViews.length; i++) {
            var model = window.opener.App.activityViews[i].getModel();
            App.activityViews[i].setModel(model);

            // App.lessonPlanView.model = window.opener.App.lessonPlanView.model;
            var lessonPlanPrintView = new LessonPlanPrintView({
                model: window.opener.App.lessonPlanView.model
            });
        }
        if (window.opener.App.secondCorePanelShouldBeVisible) {
            $('#core-list2').show();
        }
        $('body').addClass('print');
        $('body').append('<div id="ifThisDivExistsDoNotRunJavascript"></div>');
    }

    // Print activity view has to be setup from the child window
    if (window.location.hash == '#print-activity-view') {
        App.activityViews[0].setModel(window.opener.App.printActivityModel);
        $('#lesson-plan-print,#core-list,#cooldown-list').remove();
        $('body').addClass('print');
        $('body').addClass('print-activity');
        $('body').append('<div id="ifThisDivExistsDoNotRunJavascript"></div>');
    }

    // Dynamically populate menu
    for (var i = 0; i < DPA.pages.length; i++) {
        $('.sub-nav').append('<li><a href="#" rel="'+i+'">'+DPA.pages[i].title+'</a></li>');
    }

    // Content menu items
    // TODO: Shift into Backbone models and views?
    $('.sub-nav a').on('click', function(e) {
        e.preventDefault();
        var page = DPA.pages[$(this).attr('rel')]; 
        
        $('#page-modal').modal('show');
        $('#page-modal .modal-header h3').html(page.title);
        $('#page-modal .modal-body').html('Loading...');

        $.ajax({
            url: page.url,
            async: true,
            type: "GET",
            contentType: "text/html; charset=utf-8",
            cache: false,
            success: function (data, status, req) {
                $('#page-modal .modal-body').html(data);
            },
            error: function (req, status, message) {
                $('#page-modal .modal-body').html(page.content);
            }
        });
    });
    
});


//http://jarrodoverson.com/static/demos/jquery.pulse.html
jQuery.fn.pulse = function( properties, duration, numTimes, interval) {  
   
   if (duration === undefined || duration < 0) duration = 500;
   if (duration < 0) duration = 500;

   if (numTimes === undefined) numTimes = 1;
   if (numTimes < 0) numTimes = 0;

   if (interval === undefined || interval < 0) interval = 0;

   return this.each(function() {
      var $this = jQuery(this);
      var origProperties = {};
      for (property in properties) {
         origProperties[property] = $this.css(property);
      }

      var subsequentTimeout = 0;
      for (var i = 0; i < numTimes; i++) {
         window.setTimeout(function() {
            $this.animate(
               properties,
               {
                  duration:duration / 2,
                  complete:function(){
                     $this.animate(origProperties, duration / 2)}
               }
            );
         }, (duration + interval)* i);
      }
   });
  
};

jQuery.extend({
    testConnection: function (options) {
        var settings = {
            url: "http://dpa.bardon.digicon.com.au/test",
            async: true,
            type: "GET",
            contentType: "application/json; charset=utf-8",
            cache: false,
            crossDomain: true,
            dataType: "jsonp",
            success: function (data, status, req) {
                alert('good');
            },
            error: function (req, status, message) {
                alert('bad');
            }
        };
        if (options) {
            jQuery.extend(settings, options);
        };
        jQuery.ajax(settings);
    },
    downloadLesson: function (options) {        
        var settings = {
            url: "http://dpa.local.bardon.digicon.com.au/lessonpdf",
            data: {}
        };
        if (options) {
            jQuery.extend(settings, options);
        };        
        var odata = settings.data;        
        var $form = $('#lessonForm');
        $('input[type="hidden"]').remove();        
        $.each(odata.activityIds, function(index, value){
            $form.prepend($('<input type="hidden" name="ActivitieIds[' + index + ']" value="' + value + '" >'));
        });

        $form.prepend($('<input type="hidden" name="VersionId" value="' + odata.versionId + '" />'));
        $form.prepend($('<input type="hidden" name="VersionTitle" value="' + odata.versionTitle + '" />'));

        $form.submit();

        setTimeout(enableWindowLeaveNotice, 1000);
    }
});

jQuery.fn.toggleText = function (value1, value2) {
    return this.each(function () {
        var $this = $(this),
            text = $this.text();
 
        if (text.indexOf(value1) > -1)
            $this.text(text.replace(value1, value2));
        else
            $this.text(text.replace(value2, value1));
    });
};

function enableWindowLeaveNotice() {
    if (!LEAVE_NOTICE) {
        return;
    }
    window.onbeforeunload = function() { 
        return 'Navigating away from this page will lose the currently displayed activities.';
    }
}

function disableWindowLeaveNotice() {
    window.onbeforeunload = function() { }    
}

function ucfirst(string)
{
    return string.charAt(0).toUpperCase() + string.slice(1);
}


/*
 * jQuery scrollintoview() plugin and :scrollable selector filter
 *
 * Version 1.8 (14 Jul 2011)
 * Requires jQuery 1.4 or newer
 *
 * Copyright (c) 2011 Robert Koritnik
 * Licensed under the terms of the MIT license
 * http://www.opensource.org/licenses/mit-license.php
 */
(function(f){var c={vertical:{x:false,y:true},horizontal:{x:true,y:false},both:{x:true,y:true},x:{x:true,y:false},y:{x:false,y:true}};var b={duration:"fast",direction:"both"};var e=/^(?:html)$/i;var g=function(k,j){j=j||(document.defaultView&&document.defaultView.getComputedStyle?document.defaultView.getComputedStyle(k,null):k.currentStyle);var i=document.defaultView&&document.defaultView.getComputedStyle?true:false;var h={top:(parseFloat(i?j.borderTopWidth:f.css(k,"borderTopWidth"))||0),left:(parseFloat(i?j.borderLeftWidth:f.css(k,"borderLeftWidth"))||0),bottom:(parseFloat(i?j.borderBottomWidth:f.css(k,"borderBottomWidth"))||0),right:(parseFloat(i?j.borderRightWidth:f.css(k,"borderRightWidth"))||0)};return{top:h.top,left:h.left,bottom:h.bottom,right:h.right,vertical:h.top+h.bottom,horizontal:h.left+h.right}};var d=function(h){var j=f(window);var i=e.test(h[0].nodeName);return{border:i?{top:0,left:0,bottom:0,right:0}:g(h[0]),scroll:{top:(i?j:h).scrollTop(),left:(i?j:h).scrollLeft()},scrollbar:{right:i?0:h.innerWidth()-h[0].clientWidth,bottom:i?0:h.innerHeight()-h[0].clientHeight},rect:(function(){var k=h[0].getBoundingClientRect();return{top:i?0:k.top,left:i?0:k.left,bottom:i?h[0].clientHeight:k.bottom,right:i?h[0].clientWidth:k.right}})()}};f.fn.extend({scrollintoview:function(j){j=f.extend({},b,j);j.direction=c[typeof(j.direction)==="string"&&j.direction.toLowerCase()]||c.both;var n="";if(j.direction.x===true){n="horizontal"}if(j.direction.y===true){n=n?"both":"vertical"}var l=this.eq(0);var i=l.closest(":scrollable("+n+")");if(i.length>0){i=i.eq(0);var m={e:d(l),s:d(i)};var h={top:m.e.rect.top-(m.s.rect.top+m.s.border.top),bottom:m.s.rect.bottom-m.s.border.bottom-m.s.scrollbar.bottom-m.e.rect.bottom,left:m.e.rect.left-(m.s.rect.left+m.s.border.left),right:m.s.rect.right-m.s.border.right-m.s.scrollbar.right-m.e.rect.right};var k={};if(j.direction.y===true){if(h.top<0){k.scrollTop=m.s.scroll.top+h.top}else{if(h.top>0&&h.bottom<0){k.scrollTop=m.s.scroll.top+Math.min(h.top,-h.bottom)}}}if(j.direction.x===true){if(h.left<0){k.scrollLeft=m.s.scroll.left+h.left}else{if(h.left>0&&h.right<0){k.scrollLeft=m.s.scroll.left+Math.min(h.left,-h.right)}}}if(!f.isEmptyObject(k)){if(e.test(i[0].nodeName)){i=f("html,body")}i.animate(k,j.duration).eq(0).queue(function(o){f.isFunction(j.complete)&&j.complete.call(i[0]);o()})}else{f.isFunction(j.complete)&&j.complete.call(i[0])}}return this}});var a={auto:true,scroll:true,visible:false,hidden:false};f.extend(f.expr[":"],{scrollable:function(k,i,n,h){var m=c[typeof(n[3])==="string"&&n[3].toLowerCase()]||c.both;var l=(document.defaultView&&document.defaultView.getComputedStyle?document.defaultView.getComputedStyle(k,null):k.currentStyle);var o={x:a[l.overflowX.toLowerCase()]||false,y:a[l.overflowY.toLowerCase()]||false,isRoot:e.test(k.nodeName)};if(!o.x&&!o.y&&!o.isRoot){return false}var j={height:{scroll:k.scrollHeight,client:k.clientHeight},width:{scroll:k.scrollWidth,client:k.clientWidth},scrollableX:function(){return(o.x||o.isRoot)&&this.width.scroll>this.width.client},scrollableY:function(){return(o.y||o.isRoot)&&this.height.scroll>this.height.client}};return m.y&&j.scrollableY()||m.x&&j.scrollableX()}})})(jQuery);